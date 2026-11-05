//! `.docx` → plain text.
//!
//! Ported from the Android app's `DocxText`: open the OOXML container, pull
//! `word/document.xml`, turn paragraph/run boundaries into newlines and drop the
//! tags. No dependency on a Word engine, and it never fails on a file the model
//! should at least be able to skim.

use std::path::Path;

pub fn extract(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("无法打开文件：{e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("不是有效的 docx（zip 解析失败）：{e}"))?;

    let mut xml = String::new();
    {
        use std::io::Read;
        let mut entry = archive
            .by_name("word/document.xml")
            .map_err(|_| "docx 里没有 word/document.xml".to_string())?;
        entry
            .read_to_string(&mut xml)
            .map_err(|e| format!("读取正文失败：{e}"))?;
    }
    if xml.trim().is_empty() {
        return Err("docx 正文为空".into());
    }
    Ok(xml_to_text(&xml))
}

fn xml_to_text(xml: &str) -> String {
    // Structural markers first, while the tags are still there.
    let mut s = xml
        .replace("<w:br/>", "\n")
        .replace("<w:br />", "\n")
        .replace("<w:tab/>", "\t")
        .replace("<w:tab />", "\t")
        .replace("</w:p>", "\n")
        .replace("</w:tr>", "\n")
        .replace("</w:tc>", "\t");

    // Drop every remaining tag.
    let tag = regex::Regex::new(r"(?s)<[^>]*>").expect("valid tag regex");
    s = tag.replace_all(&s, "").into_owned();

    s = decode_entities(&s);

    // Normalise whitespace: keep paragraph breaks, drop trailing spaces, and
    // never leave more than one blank line in a row.
    let mut out = String::with_capacity(s.len());
    let mut blank_run = 0;
    for line in s.lines() {
        let line = line.replace('\t', "    ");
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
            out.push('\n');
        } else {
            blank_run = 0;
            out.push_str(trimmed);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

fn decode_entities(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find('&') {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let Some(end) = tail.find(';').filter(|e| *e <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..end];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            "nbsp" => Some(' '),
            _ => {
                if let Some(hex) = entity
                    .strip_prefix("#x")
                    .or_else(|| entity.strip_prefix("#X"))
                {
                    u32::from_str_radix(hex, 16).ok().and_then(char::from_u32)
                } else if let Some(dec) = entity.strip_prefix('#') {
                    dec.parse::<u32>().ok().and_then(char::from_u32)
                } else {
                    None
                }
            }
        };
        match decoded {
            Some(ch) => out.push(ch),
            None => {
                out.push('&');
                out.push_str(entity);
                out.push(';');
            }
        }
        rest = &tail[end + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn paragraphs_become_lines() {
        let xml = r#"<w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body>"#;
        assert_eq!(xml_to_text(xml), "第一段\n第二段");
    }

    #[test]
    fn tabs_and_breaks() {
        let xml = "<w:p><w:r><w:t>a</w:t></w:r><w:br/><w:r><w:t>b</w:t></w:r></w:p>";
        assert_eq!(xml_to_text(xml), "a\nb");
    }

    #[test]
    fn entities_decode() {
        assert_eq!(decode_entities("a &amp; b &lt;c&gt; &#65;"), "a & b <c> A");
    }
}
