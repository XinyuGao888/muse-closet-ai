-- Attach the R2-backed demo product photos to every seeded wardrobe.
-- The same six assets are copied under each user prefix before this script runs.

UPDATE garments
SET image_key = user_id || '/samples/seed-top-cream.jpg',
    image_type = 'image/jpeg',
    updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-top-cream';

UPDATE garments
SET image_key = user_id || '/samples/seed-dress-berry.jpg',
    image_type = 'image/jpeg',
    updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-dress-berry';

UPDATE garments
SET image_key = user_id || '/samples/seed-coat-charcoal.jpg',
    image_type = 'image/jpeg',
    updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-coat-charcoal';

UPDATE garments
SET image_key = user_id || '/samples/seed-bottom-denim.jpg',
    image_type = 'image/jpeg',
    updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-bottom-denim';

UPDATE garments
SET image_key = user_id || '/samples/seed-shoe-loafer.jpg',
    image_type = 'image/jpeg',
    updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-shoe-loafer';

UPDATE garments
SET image_key = user_id || '/samples/seed-accessory-scarf.jpg',
    image_type = 'image/jpeg',
    updated_at = CURRENT_TIMESTAMP
WHERE id LIKE '%seed-accessory-scarf';

INSERT INTO garment_sources
  (id, user_id, garment_id, source_kind, brand, product_code, product_url, raw_text)
SELECT lower(hex(randomblob(16))), g.user_id, g.id, 'product_link', 'MUJI',
       '4548076094685', 'https://www.muji.com.cn/cn/store/commodity/103509',
       '示例商品图已存入自有 R2，仅用于非商业产品原型展示；版权归原品牌或来源方。'
FROM garments AS g
WHERE g.id LIKE '%seed-top-cream'
  AND NOT EXISTS (
    SELECT 1 FROM garment_sources AS s
    WHERE s.user_id = g.user_id AND s.garment_id = g.id
      AND s.product_url = 'https://www.muji.com.cn/cn/store/commodity/103509'
  );

INSERT INTO garment_sources
  (id, user_id, garment_id, source_kind, brand, product_code, product_url, raw_text)
SELECT lower(hex(randomblob(16))), g.user_id, g.id, 'product_link', 'The RealReal / Reformation',
       'WRFMN309621', 'https://www.therealreal.com/products/women/clothing/dresses/reformation-silk-long-dress-r4r2i',
       '白底人台商品图适合作为连衣裙二维试穿样件；仅用于非商业产品原型展示。'
FROM garments AS g
WHERE g.id LIKE '%seed-dress-berry'
  AND NOT EXISTS (
    SELECT 1 FROM garment_sources AS s
    WHERE s.user_id = g.user_id AND s.garment_id = g.id
      AND s.product_url = 'https://www.therealreal.com/products/women/clothing/dresses/reformation-silk-long-dress-r4r2i'
  );

INSERT INTO garment_sources
  (id, user_id, garment_id, source_kind, brand, product_code, product_url, raw_text)
SELECT lower(hex(randomblob(16))), g.user_id, g.id, 'editorial_reference', 'Who What Wear',
       NULL, 'https://www.whowhatwear.com/grey-trench-coat-trend',
       '编辑精选中的灰色风衣商品图，已存入自有 R2；仅用于非商业产品原型展示。'
FROM garments AS g
WHERE g.id LIKE '%seed-coat-charcoal'
  AND NOT EXISTS (
    SELECT 1 FROM garment_sources AS s
    WHERE s.user_id = g.user_id AND s.garment_id = g.id
      AND s.product_url = 'https://www.whowhatwear.com/grey-trench-coat-trend'
  );

INSERT INTO garment_sources
  (id, user_id, garment_id, source_kind, brand, product_code, product_url, raw_text)
SELECT lower(hex(randomblob(16))), g.user_id, g.id, 'product_link', 'MUJI',
       '4550584114595', 'https://www.muji.us/collections/pants',
       '示例商品图已存入自有 R2，仅用于非商业产品原型展示；版权归原品牌或来源方。'
FROM garments AS g
WHERE g.id LIKE '%seed-bottom-denim'
  AND NOT EXISTS (
    SELECT 1 FROM garment_sources AS s
    WHERE s.user_id = g.user_id AND s.garment_id = g.id
      AND s.product_url = 'https://www.muji.us/collections/pants'
  );

INSERT INTO garment_sources
  (id, user_id, garment_id, source_kind, brand, product_code, product_url, raw_text)
SELECT lower(hex(randomblob(16))), g.user_id, g.id, 'product_link', '& Other Stories',
       '1320560001', 'https://www.stories.com/en-us/product/square-toe-leather-loafers-black-1320560001/',
       '示例商品图已存入自有 R2，仅用于非商业产品原型展示；版权归原品牌或来源方。'
FROM garments AS g
WHERE g.id LIKE '%seed-shoe-loafer'
  AND NOT EXISTS (
    SELECT 1 FROM garment_sources AS s
    WHERE s.user_id = g.user_id AND s.garment_id = g.id
      AND s.product_url = 'https://www.stories.com/en-us/product/square-toe-leather-loafers-black-1320560001/'
  );

INSERT INTO garment_sources
  (id, user_id, garment_id, source_kind, brand, product_code, product_url, raw_text)
SELECT lower(hex(randomblob(16))), g.user_id, g.id, 'product_link', 'Johnstons of Elgin',
       NULL, 'https://johnstonsofelgin.com/products/vicuna-blend-check-scarf',
       '示例商品图已存入自有 R2，仅用于非商业产品原型展示；版权归原品牌或来源方。'
FROM garments AS g
WHERE g.id LIKE '%seed-accessory-scarf'
  AND NOT EXISTS (
    SELECT 1 FROM garment_sources AS s
    WHERE s.user_id = g.user_id AND s.garment_id = g.id
      AND s.product_url = 'https://johnstonsofelgin.com/products/vicuna-blend-check-scarf'
  );
