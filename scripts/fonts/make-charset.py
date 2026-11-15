# 生成 scripts/fonts/charset.txt —— 字体子集用的字符表。
# 只跑一次，结果已提交在仓库里（子集化不需要联网）。
#
# 来源：本机无法取到《通用规范汉字表》一级字表（3500 字）的电子文本，
# 改用等价口径的 **GB2312 一级汉字（3755 字）** 作常用字表 ——
# 它是 3500 一级字表的近似超集，多出来的都是常用字，只会让覆盖更全、不会缺字。
# 另外把 GB2312 的符号区（0xA1A1–0xA9FE，含全角标点）整段收进来，
# 再补上排版常用但不在 GB2312 里的 —— · …
import sys

chars = set()

# GB2312 符号区（全角标点 / 数字 / 量词符号）
for hi in range(0xA1, 0xAA):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode('gb2312'))
        except UnicodeDecodeError:
            pass

# GB2312 一级汉字 0xB0A1–0xD7F9 = 3755 字（二级汉字 0xD8A1–0xF7FE 不收）
for hi in range(0xB0, 0xD8):
    for lo in range(0xA1, 0xFF):
        try:
            chars.add(bytes([hi, lo]).decode('gb2312'))
        except UnicodeDecodeError:
            pass

# ASCII 可见字符
chars.update(chr(c) for c in range(0x20, 0x7F))
# CJK 标点 / 全角字符区段（与 subset.sh 的 --unicodes 对齐，写进字表方便阅读与校验）
chars.update(chr(c) for c in range(0x3000, 0x3040))
chars.update(chr(c) for c in range(0xFF00, 0xFFF0))
# 排版常用：破折号 / 省略号 / 间隔号（不在上面两段里）
chars.update('—…·')

sys.stdout.write(''.join(sorted(chars)))
