// The logo writes the name in two colors: "Help" in navy, "near" in blue. Names that do not start with "Help" stay in one color.
export function splitBrand(name: string): [string, string] {
  return name.length > 4 && name.startsWith('Help') ? [name.slice(0, 4), name.slice(4)] : [name, '']
}
