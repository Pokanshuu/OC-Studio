'use client'

/**
 * 头像组件（`docs/模板.md §6.1` / §6.2）。
 *
 * **不重写一套上传**：头图 + 头像的交互（单击看大图、右键 / 长按菜单、裁剪）
 * 全在 `ProfileBannerEditor` 里；「头像」组件只是把 `showHeader` 关掉，
 * 单独摆一个圆形槽位（角色的默认模板就是这么用的）。
 */
import { ProfileBannerEditor } from '../ProfileBannerEditor'

interface AvatarBlockProps {
  value?: string
  onChange: (path: string) => void
  onRemove?: () => void
  /** 国家用旗帜，其余用头像 */
  avatarType?: 'avatar' | 'flag'
}

export function AvatarBlock({ value, onChange, onRemove, avatarType = 'avatar' }: AvatarBlockProps) {
  return (
    <div className="relative w-fit">
      <ProfileBannerEditor
        showHeader={false}
        avatarType={avatarType}
        avatarUrl={value}
        onAvatarChange={onChange}
        onAvatarRemove={onRemove}
      />
    </div>
  )
}
