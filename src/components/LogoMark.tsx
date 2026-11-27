import logo from '../shared/logo-data.json'

/** The logo is embedded in the page itself (an 80px copy, about 3 KB), so it can never show up as a broken picture when a file request fails. */
export default function LogoMark() {
  return <img src={logo.mark} alt="" width="40" height="40" decoding="async" />
}
