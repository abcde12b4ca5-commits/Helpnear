// Practical, non-numeric guidance shown on each public service page (no prices, no promises). Each service has its own text: identical boilerplate across pages is treated as thin content.
// Format per service: [what changes the quote, how to prepare, common mistakes]. Keep adding real detail over time; update the text if a rule or practice changes.
export const DETAIL = {
  'house-cleaning': [
    ['The size of the home and the number of bathrooms and kitchens usually matter most.', 'A first deep clean takes longer than a regular visit, and many cleaners quote the two differently.', 'Pets, heavy buildup and extra tasks such as inside the oven or fridge add time.'],
    ['Put away personal items, cash and fragile things before the visit.', 'Tell them about pets, allergies and any products you do not want used.', 'Say who provides the vacuum and supplies, and whether a lockbox or key is needed.'],
    ['Agreeing on "a clean house" without a written list of rooms and tasks. Different people mean different things.', 'Leaving out stairs, a basement or a second living area when asking for a price.'],
  ],
  'window-cleaning': [
    ['The number of windows, how many floors, and whether you want the inside, the outside or both.', 'Screens, tracks and sills are often a separate task.', 'Hard-water stains or paint on the glass can need extra work.'],
    ['Clear the area around windows inside and move plants or furniture away from the glass.', 'Say which windows are hard to reach, for example above a roof or a stairwell.', 'Note any cracked glass or loose seals before work starts.'],
    ['Asking only for a price per window without saying how many floors the home has.', 'Leaving streaks to the end of the job: look at the glass in daylight before you finish paying.'],
  ],
  'pressure-washing': [
    ['The surface (concrete, wood, siding or brick) and the area to be washed.', 'The amount of mildew, oil or rust on the surface.', 'Access to an outdoor water tap and how close the work is to doors, windows and plants.'],
    ['Move cars, furniture and planters, and close windows and doors.', 'Say if you want a cleaner or sealant applied, and which parts are painted or old.', 'Confirm who supplies water and power.'],
    ['Using too much pressure on wood or older siding, which can leave marks or force water behind boards.', 'Not covering plants and outdoor outlets before the work begins.'],
  ],
  'carpet-upholstery-cleaning': [
    ['The number of rooms, the type of carpet or fabric and the kind of stains.', 'Pet odors and old stains can need a separate treatment.', 'Stairs and furniture that must be moved can change the time needed.'],
    ['Vacuum first if you can and point out stains, noting what caused them if you know.', 'Check the care tag on upholstery, because some fabrics must not get wet.', 'Ask how long the carpet will take to dry and plan for that.'],
    ['Over-wetting carpet, which slows drying and can cause a musty smell.', 'Expecting every old stain to come out completely: ask what is realistic before the visit.'],
  ],
  painting: [
    ['The number of rooms, ceiling height and how much wall repair or sanding is needed.', 'Paint quality, the number of coats and whether the old color is much darker.', 'Trim, doors and ceilings are often priced separately from walls.'],
    ['Decide the colors and finish before the visit, and buy a small sample to test on the wall.', 'Clear the room or leave space for furniture to be moved and covered.', 'Agree who buys the paint and primer.'],
    ['Skipping preparation. Most paint failures come from dirty, glossy or unrepaired walls, not from the paint itself.', 'Not looking at the finished wall in different light before the work is signed off.'],
  ],
  handyman: [
    ['A list of small jobs is often priced by time, so the number of items and how long each takes counts.', 'Special parts, a second visit or a hard-to-reach location can change the total.', 'Who buys the materials changes the quote too.'],
    ['Write down every job and include photos if you can.', 'Have the parts or fixtures ready, or agree who will buy them.', 'Clear the work area and tell the worker about pets.'],
    ['Asking for work that needs a license (electrical, plumbing, gas, HVAC). Those jobs are not allowed on this platform and need a licensed professional.', 'Adding new jobs on the day without agreeing on the extra cost.'],
  ],
  'furniture-assembly': [
    ['The number and size of items; wardrobes, bunk beds and desks with many parts take longer than simple shelves.', 'Missing parts or damaged boxes can add time.', 'Stairs, tight rooms or items that must be carried to another floor.'],
    ['Open the boxes only if you want, but check that the instructions and the hardware bag are present.', 'Clear a flat space close to where the furniture will stand.', 'Say whether you want packaging taken away.'],
    ['Leaving heavy furniture unanchored to the wall when children are in the home. Ask the assembler to fix tall pieces to the wall.', 'Not checking that drawers and doors close properly before the job is finished.'],
  ],
  'tv-shelf-mounting': [
    ['TV size and weight, wall type (drywall, brick or concrete) and the type of mount.', 'Whether you want the cables hidden along the wall.', 'The number of shelves, mirrors or frames to be hung.'],
    ['Buy a mount rated for the weight and size of your TV, and keep all the parts in the box.', 'Decide the height by sitting in your usual seat first.', 'Check what is behind the wall if you know it, and tell the worker about any pipes or wires.'],
    ['Mounting without finding a stud or using the right anchor for the wall type.', 'Placing the TV too high, which strains the neck over time.'],
  ],
  'drywall-repair': [
    ['The size and number of holes and whether the damage is from water.', 'Matching the texture and the paint can take extra visits.', 'The ceiling or an area that needs large patches costs more effort than a small wall hole.'],
    ['Move furniture and cover the floor close to the repair.', 'Keep a bit of the paint, or its brand and color name, to match later.', 'Fix the source first if the damage came from a leak.'],
    ['Patching over a wet wall. The leak must be fixed and the wall dried before any patch.', 'Expecting to paint on the same day: the compound needs time to dry between coats.'],
  ],
  'flooring-installation': [
    ['The area in square feet, the type of flooring and the condition of the subfloor.', 'Removing the old floor, trimming doors and installing baseboards or transitions.', 'Moving heavy furniture and appliances.'],
    ['Measure the rooms and check how the new material should acclimate before it is installed.', 'Agree who orders the materials and how much extra is added for cuts.', 'Clear the rooms and plan where the household will walk while it cures or settles.'],
    ['Ordering exactly the measured area. Cuts and mistakes need extra material.', 'Starting work on an uneven or damp subfloor. Ask how it will be checked and fixed.'],
  ],
  'fence-work': [
    ['The length and height, the material (wood, vinyl or metal) and whether old fence has to come out.', 'Gates, slopes and hard digging conditions.', 'Permits and neighborhood rules may apply.'],
    ['Confirm the property line before work begins; a survey or plat can help.', 'Check local permit and HOA rules, and talk to the neighbor if the fence is shared.', 'Mark sprinklers and buried lines so they are not damaged.'],
    ['Building on the wrong side of the line, which can lead to a dispute and removal.', 'Not agreeing who removes and disposes of the old fence.'],
  ],
  'deck-work': [
    ['The size, the height from the ground and the material (treated wood, composite or other).', 'Repairs depend on how much of the frame is damaged.', 'Stairs, railings and permits can change the cost and the time.'],
    ['Find out whether your city requires a permit for a new deck or major repair.', 'Take photos of the damaged areas and of the frame underneath.', 'Agree on the finish, such as stain or sealer, and who supplies it.'],
    ['Repairing the surface boards while the structure beneath is rotten.', 'Skipping the permit, which can cause trouble when the house is sold or inspected.'],
  ],
  'gutter-cleaning': [
    ['The number of stories, the length of the gutters and how much debris there is.', 'Whether downspouts are clogged.', 'Roof pitch and access for a ladder.'],
    ['Say how many stories the house has and whether trees hang above the roof.', 'Ask if they flush the downspouts and check for sagging or leaks.', 'Remove cars and items from under the ladder area.'],
    ['Leaving the downspouts blocked after the gutter itself is clean.', 'Doing the job only once a year when many trees overhang the roof.'],
  ],
  'lawn-care': [
    ['The lawn size, the slope and how often you want the service.', 'Edging, trimming and cleanup after mowing are sometimes separate.', 'Gates and how easy it is to reach the back yard.'],
    ['Say where the gate is and keep pets inside while the work is done.', 'Pick up toys, hoses and loose items from the grass.', 'Tell the worker about sprinkler heads and areas to avoid.'],
    ['Cutting the grass too short, which weakens it in hot weather.', 'Not agreeing in advance what happens in the rain or when the grass grows quickly.'],
  ],
  'yard-cleanup': [
    ['The amount of leaves and brush, and whether it has to be hauled away or only bagged.', 'The size of the yard and how overgrown it is.', 'Branches and thick brush that need extra tools.'],
    ['Walk the yard and show what should be removed and what should stay.', 'Say where bags or piles can go, or whether they must be taken away.', 'Mark plants and garden beds you want to keep.'],
    ['Assuming tree removal is included. It is not covered here and needs a qualified professional.', 'Not agreeing on the disposal of green waste, which some areas have rules about.'],
  ],
  'garage-cleanout': [
    ['The amount of items and how much sorting and organizing you want.', 'Heavy or bulky things and the number of trips to carry them.', 'Whether shelving or labeling is part of the job.'],
    ['Decide in advance what you keep, donate or throw away; it saves time.', 'Separate paint, chemicals, batteries and other hazardous items from the rest.', 'Tell the worker about any valuable things in boxes.'],
    ['Assuming hauling away waste is included. It is not part of this service.', 'Starting without a plan for where the kept items will be stored.'],
  ],
  'home-organizing': [
    ['The number of rooms, closets or pantries and how much needs to be sorted.', 'Whether you want containers and labels brought, or the worker uses what you own.', 'The time you need for you to make decisions about things.'],
    ['Think about how you use each space, for example what you reach for every day.', 'Set aside time to decide what to keep, because the worker cannot choose for you.', 'Say what you want to donate or throw away.'],
    ['Buying many containers before you decide what to keep.', 'Organizing once without a simple routine to keep it that way.'],
  ],
  'move-out-cleaning': [
    ['The size of the home, how clean it was left and whether it is empty.', 'Appliances, cabinets and closets cleaned on the inside.', 'The deadline, because a same-day turnover may need more than one person.'],
    ['Empty the home first so every surface can be reached.', 'Check your lease or the rental rules for what the cleaning must include.', 'Take photos before and after, for the landlord or the next guest.'],
    ['Booking the cleaning before everything is moved out.', 'Not agreeing on the details for an Airbnb turnover, such as linens and restocking.'],
  ],
  'pet-sitting': [
    ['The number and kind of pets, special needs and medicines.', 'Overnight stays versus short drop-in visits.', 'Travel distance and holidays.'],
    ['Arrange a meet-and-greet before the first day so the pet gets to know the sitter.', 'Write down feeding, medication, walking and vet instructions, and an emergency contact.', 'Share how to reach you and who may decide if something happens.'],
    ['Leaving out health or behavior information that the sitter needs.', 'Not checking local rules and liability, which are not verified by this platform.'],
  ],
  'dog-walking': [
    ['The length of the walk, the number of dogs and how often.', 'Distance from the worker and how hard the dog is to handle.', 'Weather and the time of day you need.'],
    ['Share the dog\'s size, energy, leash habits and fears.', 'Leave a leash, bags and a clear way to get in, and say where the dog should not go.', 'Agree on what happens in very hot, cold or rainy weather.'],
    ['Not telling the walker that the dog pulls, bites or reacts to other dogs.', 'Ignoring local leash rules, which the owner and the walker should follow.'],
  ],
  'car-detailing': [
    ['The size of the vehicle, its condition and whether you want the inside, the outside or both.', 'Pet hair, stains and smells.', 'Whether they need your water and power or bring their own.'],
    ['Remove personal items and trash from the car before the visit.', 'Park where there is space to work and, if needed, access to water and power.', 'Point out scratches or damage you already know about.'],
    ['Expecting detailing to remove deep scratches: that is a different, paint-correction job.', 'Not checking the car in daylight when the work is finished.'],
  ],
  'holiday-lights': [
    ['The size and height of the roofline and the number of trees or bushes.', 'Whether the worker brings the lights or uses yours.', 'Takedown after the holidays and storing the lights.'],
    ['Test your lights and replace broken strings before the date.', 'Decide where the power outlet is and the day you want the lights switched on.', 'Agree on the date for taking them down.'],
    ['Hanging lights on a ladder without good footing, which is a real safety risk: check that the worker is careful and ask about liability.', 'Overloading an outlet with too many strings.'],
  ],
  'landscaping-mulching': [
    ['The size of the beds, the amount of mulch and the plants or edging you want.', 'The amount of weeding and old mulch to remove.', 'Delivery of materials and the distance to the beds.'],
    ['Measure the beds and decide the type and color of mulch.', 'Agree who buys the materials and who takes away what is left over.', 'Mark sprinklers, lights and plants to keep.'],
    ['Piling mulch against tree trunks and the house, which can hold moisture and attract pests.', 'Spreading it too thick, which can stop water and air getting to the roots.'],
  ],
  'errand-running': [
    ['The number of stops, the distance driven and how long the shopping takes.', 'Whether the worker buys the items with their own money first and you repay them.', 'Heavy or bulky loads and deliveries to an upper floor.'],
    ['Write a clear list with brands, sizes and acceptable substitutes.', 'Agree how the worker will be repaid for purchases and how receipts are shown.', 'Tell the worker the delivery time window and where to leave the items.'],
    ['Sending cash or cards without agreeing in advance how receipts and change are handled.', 'Asking for items that need an age check or a prescription: those are not allowed here.'],
  ],
  'laundry-help': [
    ['The number of loads, whether you want washing, drying, folding or ironing, and the types of fabric.', 'Delicate or dry-clean-only clothes need different handling.', 'Whether the work is at your home or the worker takes the laundry away.'],
    ['Separate colors and delicate items and point out stains.', 'Say which detergent to use if you have allergies or sensitive skin.', 'Check the care labels and tell the worker about anything that must not go in a dryer.'],
    ['Handing over dry-clean-only items without saying so.', 'Not agreeing how long the laundry may be away from your home.'],
  ],
  'trash-bin-cleaning': [
    ['The number of bins, how dirty they are and how often you want them cleaned.', 'Whether the worker brings water and the wash equipment.', 'Local rules about where wash water may drain.'],
    ['Empty the bins on collection day and leave them in an open space.', 'Show where an outside tap is if the worker needs yours.', 'Mention any bins with a broken lid or wheel.'],
    ['Cleaning bins on a day when they are still full.', 'Letting dirty wash water run into a storm drain: ask the worker how it will be handled.'],
  ],
  'event-setup-help': [
    ['The number of guests, the amount of furniture and decorations, and the hours needed.', 'Whether there is also teardown and cleanup afterwards.', 'The venue: stairs, distance to carry items and parking.'],
    ['Send a simple layout or photo of how you want the space set up.', 'Agree start time, end time and who provides the equipment.', 'Tell the worker who the on-site contact is.'],
    ['Booking setup without leaving time before guests arrive.', 'Expecting bartending or childcare: those are not offered here.'],
  ],
  'photography': [
    ['The type of event or session, its length and the number of final edited photos you want.', 'Travel distance and the number of locations.', 'How fast you need the photos delivered.'],
    ['Make a short list of the shots and the people you must have.', 'Check the light and the location before the day, and plan for bad weather.', 'Agree how the photos will be delivered and who owns the rights to use them.'],
    ['Not agreeing in writing on usage rights and how many edited photos you get.', 'Booking only an hour for an event that needs more coverage.'],
  ],
  'home-tech-help': [
    ['The number of devices and whether the job is setup, fixing a problem or teaching.', 'Older or unusual equipment takes longer.', 'Whether new parts, like a router or cables, must be bought.'],
    ['Write down what is not working and what you want to be able to do.', 'Have your Wi-Fi name, passwords and account logins ready, and change them after if you wish.', 'Back up important files before anyone works on a computer.'],
    ['Sharing passwords or giving remote access to a person you do not know well.', 'Asking for new wiring inside walls: that needs a licensed professional and is not allowed here.'],
  ],
  'furniture-refinishing': [
    ['The size and number of pieces, the material and the condition of the old finish.', 'The paint or stain you choose and the number of coats.', 'Repairs to loose joints or damaged surfaces.'],
    ['Decide the color and finish and test it on a hidden spot first.', 'Agree whether the piece is worked on at your home or taken to the worker.', 'Take photos of the piece before you start, and note any damage.'],
    ['Painting over a dirty or glossy surface without sanding.', 'Not leaving enough drying time before using the furniture.'],
  ],
  'bike-help': [
    ['Whether it is a new bike to assemble, a tune-up or a repair, and the type of bike.', 'Parts that need to be replaced and who buys them.', 'Electric bikes with batteries and motors are more complex.'],
    ['Bring all the parts and the manual for a new bike, and note your height.', 'Describe the problem: noises, gears that skip or brakes that feel weak.', 'Say which parts you want replaced and which you want to keep.'],
    ['Riding a bike after assembly without checking the brakes and the tires first.', 'Asking for work on electric motors or batteries unless the worker has said they do it.'],
  ],
  'house-sitting': [
    ['The number of visits, how many plants and any pets or mail to handle.', 'Length of the trip and whether someone stays overnight.', 'How far the worker lives from your home.'],
    ['Leave clear written notes: watering amounts, where things are and who to call.', 'Share keys or codes only after you have met the person and agreed the plan.', 'Tell neighbors that someone will be visiting.'],
    ['Giving a lockbox code without any trial visit or check-in plan.', 'Not asking the worker to send a short update after each visit.'],
  ],
  'gardening-planting': [
    ['The size of the beds, the number of plants and how much weeding or soil work is needed.', 'Whether plants and soil are bought by you or by the worker.', 'Local climate and the time of year.'],
    ['Mark where you want each plant and how much sun the spot gets.', 'Agree who buys the plants, soil and mulch.', 'Point out buried lines and sprinkler heads.'],
    ['Planting the wrong plants for the amount of sun and water in that spot.', 'Asking for pesticide or herbicide spraying: those can need a license and are not allowed here.'],
  ],
  'sewing-alterations': [
    ['The type of garment and the work needed: hemming, resizing or repair.', 'Delicate or lined fabrics take more time.', 'Whether the worker comes to you or takes the clothes away.'],
    ['Try the garment on and mark the places that need changing, using pins or tape.', 'Bring the shoes you plan to wear for a hem.', 'Agree the date when the clothes will be ready.'],
    ['Cutting or washing before a fitting.', 'Ordering alterations for an event without leaving spare days for corrections.'],
  ],
  'blinds-curtains': [
    ['The number of windows, their width and height, and the wall type for the brackets.', 'Heavy curtains and wide windows need stronger supports.', 'Whether you or the worker buys the rods and blinds.'],
    ['Measure the windows and buy the hardware before the visit, or agree a measuring visit.', 'Decide how high above the window you want the rod.', 'Clear furniture from under the windows.'],
    ['Skipping studs or the right anchors for a heavy curtain rod.', 'Measuring only the glass and not the full window frame.'],
  ],
  'snow-removal': [
    ['The size of the driveway, walks and steps and the depth of the snow.', 'Whether you want visits during or after the storm.', 'De-icing and how many visits are needed.'],
    ['Say which areas must be cleared first and where the snow can be piled.', 'Mark edges, steps and anything buried that could be damaged.', 'Agree on the price for repeated visits before the storm.'],
    ['Piling snow where it blocks a drain or a neighbor\'s path.', 'Not agreeing in advance on who handles ice after the snow is gone.'],
  ],
}
export const SECTION_TITLES = ['What affects the quote', 'How to prepare before the visit', 'Common mistakes to avoid']
