-- Align existing seeded wardrobes with the licensed VTON sample asset pack.

UPDATE garment_sources
SET source_kind = 'editorial_reference', brand = 'Pexels / A.V. Phina', product_code = NULL,
    product_url = 'https://www.pexels.com/photo/beige-knitted-sweater-14377376/',
    raw_text = 'Pexels 许可的演示素材；仅用于产品流程与模型测试。'
WHERE garment_id LIKE '%seed-top-cream';

UPDATE garment_sources
SET source_kind = 'editorial_reference', brand = 'Wikimedia Commons', product_code = NULL,
    product_url = 'https://commons.wikimedia.org/wiki/File:Jeans.jpg',
    raw_text = '公有领域演示素材；仅用于产品流程与模型测试。'
WHERE garment_id LIKE '%seed-bottom-denim';

UPDATE garment_sources
SET source_kind = 'editorial_reference', brand = 'Pexels / Fahmi Garna', product_code = NULL,
    product_url = 'https://www.pexels.com/photo/gray-shirt-hanging-on-a-clothes-hanger-13094233/',
    raw_text = 'Pexels 许可的演示素材；仅用于产品流程与模型测试。'
WHERE garment_id LIKE '%seed-coat-charcoal';

UPDATE garment_sources
SET source_kind = 'editorial_reference', brand = 'Pexels / Marcelo Verfe', product_code = NULL,
    product_url = 'https://www.pexels.com/photo/red-dress-on-hanger-19895956/',
    raw_text = 'Pexels 许可的演示素材；仅用于产品流程与模型测试。'
WHERE garment_id LIKE '%seed-dress-berry';

UPDATE garment_sources
SET source_kind = 'editorial_reference', brand = 'Pexels / Jose Martin Segura Benites', product_code = NULL,
    product_url = 'https://www.pexels.com/photo/leather-shoes-on-white-and-gray-background-27063078/',
    raw_text = 'Pexels 许可的演示素材；仅用于产品流程与模型测试。'
WHERE garment_id LIKE '%seed-shoe-loafer';

UPDATE garment_sources
SET source_kind = 'editorial_reference', brand = 'Wikimedia Commons / Boranzohn', product_code = NULL,
    product_url = 'https://commons.wikimedia.org/wiki/File:Silk_scarf.JPG',
    raw_text = 'CC0 演示素材；仅用于产品流程与模型测试。'
WHERE garment_id LIKE '%seed-accessory-scarf';
