-- Point seeded wardrobes at the bundled, license-tracked demo asset pack.
-- The image API serves these paths from static assets when no R2 object exists.

UPDATE garments SET image_key = 'demo-assets/seed-top-cream.jpg', image_type = 'image/jpeg', updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-top-cream';

UPDATE garments SET image_key = 'demo-assets/seed-bottom-denim.jpg', image_type = 'image/jpeg', updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-bottom-denim';

UPDATE garments SET image_key = 'demo-assets/seed-coat-charcoal.jpg', image_type = 'image/jpeg', updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-coat-charcoal';

UPDATE garments SET image_key = 'demo-assets/seed-dress-berry.jpg', image_type = 'image/jpeg', updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-dress-berry';

UPDATE garments SET image_key = 'demo-assets/seed-shoe-loafer.jpg', image_type = 'image/jpeg', updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-shoe-loafer';

UPDATE garments SET image_key = 'demo-assets/seed-accessory-scarf.jpg', image_type = 'image/jpeg', updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-accessory-scarf';

-- Run scripts/update-demo-vton-sources.sql after this file to align attribution.
