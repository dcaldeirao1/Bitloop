import { Link } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'

/**
 * Bitloop wordmark — dark logo on dark theme, light logo on light theme.
 * @param {'nav' | 'hero' | 'footer'} size
 */
export function BrandLogo({
  to = '/',
  size = 'nav',
  className = '',
}) {
  const { isDark } = useTheme()
  const src = isDark ? '/bitloopLogo.png' : '/bitloopLogoLight.png'

  const dims =
    size === 'hero'
      ? { height: undefined, className: 'landing-hero-logo' }
      : size === 'footer'
        ? { height: 22, className: 'brand-logo is-sm' }
        : { height: 28, className: 'brand-logo' }

  const img = (
    <img
      key={src}
      src={src}
      alt="bitloop"
      height={dims.height}
      className={`${dims.className} ${className}`.trim()}
      decoding="async"
    />
  )

  if (!to) return img

  return (
    <Link to={to} className="brand-logo-link inline-flex items-center" aria-label="bitloop home">
      {img}
    </Link>
  )
}
