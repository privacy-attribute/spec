type AvatarProps = { src?: string; initials?: string; size?: number };

export function Avatar({ src, initials, size = 24 }: AvatarProps) {
  if (!src) return <span className="avatar-initials">{initials}</span>; // @expect personal mask
  return <img className="avatar" src={src} width={size} height={size} alt="" />;
}
