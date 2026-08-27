export const demoPersonSamples = [
  {
    id: "fashn-official",
    name: "FASHN 官方测试人物",
    note: "官方基准输入，适合先验证链路",
    path: "/demo/vton/people/fashn-model.webp",
    filename: "fashn-vton-model.webp",
    sourceUrl: "https://github.com/fashn-AI/fashn-vton-1.5",
  },
  {
    id: "pexels-life",
    name: "Pexels 全身生活照",
    note: "头到脚完整入镜，适合观察身份保持",
    path: "/demo/vton/people/pexels-full-body.jpg",
    filename: "pexels-full-body-sample.jpg",
    sourceUrl: "https://www.pexels.com/photo/confident-man-in-white-shirt-standing-on-white-background-33971227/",
  },
] as const;

const demoGarmentAssets = {
  "seed-top-cream": "/demo/vton/garments/seed-top-cream-cutout.png",
  "seed-bottom-denim": "/demo/vton/garments/seed-bottom-denim-cutout.png",
  "seed-coat-charcoal": "/demo/vton/garments/seed-coat-charcoal-cutout.png",
  "seed-dress-berry": "/demo/vton/garments/seed-dress-berry-cutout.png",
  "seed-shoe-loafer": "/demo/vton/garments/seed-shoe-loafer-cutout.png",
  "seed-accessory-scarf": "/demo/vton/garments/seed-accessory-scarf-cutout.png",
} as const;

export function demoGarmentAssetForId(garmentId: string) {
  const seedId = Object.keys(demoGarmentAssets).find((id) =>
    garmentId === id || garmentId.endsWith(`-${id}`),
  ) as keyof typeof demoGarmentAssets | undefined;
  return seedId ? demoGarmentAssets[seedId] : null;
}

export const officialFashnGarmentSample = {
  path: "/demo/vton/garments/fashn-official-garment.webp",
  sourceUrl: "https://github.com/fashn-AI/fashn-vton-1.5",
};
