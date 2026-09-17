-- The boutique and services exactly as the site shows them today, so switching
-- the pages to database rendering changes nothing a visitor can see. Prices are
-- only filled in where the site already publishes one.

INSERT INTO products (slug, name, description, price_fils, image_url, active, featured, sort) VALUES
  ('plantoys-vegetable-set', 'PlanToys Assorted Vegetable Set', 'Wooden cutting board, knife and five vegetables. Ages 18m+.', NULL, 'assets/img/shop/plantoys-vegetable-set', 1, 1, 10),
  ('puzzle-fun-in-the-sun', 'Fun in the Sun 300-Piece Puzzle', 'Eurographics XL-piece jigsaw by Corinne Hartley.', NULL, 'assets/img/shop/puzzle-fun-in-the-sun', 1, 1, 20),
  ('stitch-gift-basket', 'Stitch Gift Basket', 'Ready-wrapped gift basket built around a soft plush.', NULL, 'assets/img/shop/stitch-gift-basket', 1, 1, 30),
  ('sonic-plush', 'Sonic Plush Toy', 'Soft plush character toy, sized for small hands.', NULL, 'assets/img/shop/sonic-plush', 1, 1, 40),
  ('gumball-machine', 'Mini Gumball Machine', 'Sweet-Factory dispenser filled with chocolate gems.', NULL, 'assets/img/shop/gumball-machine', 1, 1, 50),
  ('candy-dispensers', 'Rainbow Candy Dispensers', 'Novelty dispensers with collectable toppers.', NULL, 'assets/img/shop/candy-dispensers', 1, 1, 60),
  ('shark-snappers', 'Shark Snapper', 'Snapping shark grabber toy, sold singly.', NULL, 'assets/img/shop/shark-snappers', 1, 1, 70),
  ('twist-lollipop', 'Rainbow Twist Lollipop', 'Large twisted lollipop on a stick.', NULL, 'assets/img/shop/twist-lollipop', 1, 1, 80),
  ('peach-rings', 'Sweet-Factory Peach Rings', '140g bag, made with natural colours.', NULL, 'assets/img/shop/peach-rings', 1, 1, 90),
  ('treasure-island-balloon', 'Treasure Island Balloon', 'Gold latex balloon with the Treasure Island anchor.', NULL, 'assets/img/shop/treasure-island-balloon', 1, 1, 100);

INSERT INTO offerings (slug, kind, name, summary, price_fils, price_unit, max_children, active, sort) VALUES
  ('treasure-island-adventure', 'event', 'Treasure Island Adventure', 'A hosted run through the island with game stations, challenges and a trophy for the winner.', NULL, 'child', 20, 1, 10),
  ('royal-birthday', 'party', 'Treasure Island Royal Birthday', 'Red-carpet arrival, portraits in gold frames, a themed room, custom cake and a dedicated host.', NULL, 'booking', 40, 1, 20),
  ('playgroup', 'program', 'Treasure Island Playgroup Program', 'Weekday mornings in small groups: welcome circle, active play, craft, snack and a story.', NULL, 'child', 4, 1, 30),
  ('talent-centre', 'program', 'Treasure Island Talent Centre', 'Dance, performance and stage confidence with certified instructors and a certificate.', NULL, 'child', 4, 1, 40),
  ('weekend-activities', 'event', 'Treasure Island Weekend Activities', 'Hosted games, craft sessions and shows running across the island every weekend.', NULL, 'child', 6, 1, 50),
  ('holiday-camps', 'camp', 'Treasure Island Camps', 'Half-day and full-day camps through every school break, with a new theme each week.', NULL, 'child', 4, 1, 60),
  ('school-nursery-visit', 'program', 'School & Nursery Visit', 'An hour of play, games and activities, a stage show and an arts & crafts workshop. 9:00 AM - 12:00 PM.', 10000, 'child', 60, 1, 70);
