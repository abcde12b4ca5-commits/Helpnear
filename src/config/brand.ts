// Brand data lives in brand.json (single source of truth). Change the name there, nowhere else.
import data from './brand.json'

export const brand = {
  name: data.name,
  tagline: data.tagline,
  disclaimer: `${data.name} is a platform that connects people. We are not a contractor or an employer.`,
  supportEmail: data.supportEmail,
} as const
