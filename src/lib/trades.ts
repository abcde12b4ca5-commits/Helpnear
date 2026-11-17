// Every trade that is open today: id + name must match the enabled categories in firebase/seed/data.mjs (a unit test checks this).
// Each tile links to its own public page, which also gives search engines a link to every service.
export const TRADES: [string, string][] = [
  ['house-cleaning', 'House cleaning'], ['window-cleaning', 'Window cleaning'], ['pressure-washing', 'Pressure washing'],
  ['carpet-upholstery-cleaning', 'Carpet and upholstery cleaning'], ['painting', 'Painting'], ['handyman', 'Handyman (general repairs)'],
  ['furniture-assembly', 'Furniture assembly'], ['tv-shelf-mounting', 'TV and shelf mounting'], ['drywall-repair', 'Drywall repair and patching'],
  ['flooring-installation', 'Flooring installation'], ['fence-work', 'Fence repair and installation'], ['deck-work', 'Deck repair and building'],
  ['gutter-cleaning', 'Gutter cleaning'], ['lawn-care', 'Lawn mowing and yard maintenance'], ['yard-cleanup', 'Yard cleanup'],
  ['move-out-cleaning', 'Move-out and Airbnb cleaning'], ['garage-cleanout', 'Garage cleanout and organizing'], ['home-organizing', 'Home organizing'],
  ['pet-sitting', 'Pet sitting'], ['dog-walking', 'Dog walking'], ['car-detailing', 'Mobile car detailing'],
  ['holiday-lights', 'Holiday light installation'], ['landscaping-mulching', 'Landscaping and mulching'], ['snow-removal', 'Snow removal'],
  ['errand-running', 'Errands and personal shopping'], ['laundry-help', 'Laundry, folding and ironing'], ['trash-bin-cleaning', 'Trash bin cleaning'],
  ['event-setup-help', 'Event setup and party help'], ['photography', 'Photography for events and portraits'], ['home-tech-help', 'Home tech help'],
  ['furniture-refinishing', 'Furniture painting and refinishing'], ['bike-help', 'Bike assembly and tune-ups'], ['house-sitting', 'House sitting and plant care'],
  ['gardening-planting', 'Gardening and planting'], ['sewing-alterations', 'Sewing and clothing alterations'], ['blinds-curtains', 'Blinds and curtain installation'],
]
