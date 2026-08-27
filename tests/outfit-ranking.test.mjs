import assert from "node:assert/strict";
import test from "node:test";

import { rankOutfits, seedGarments } from "../lib/wardrobe.ts";

const garments = seedGarments.map((item) => ({ ...item, imageUrl: null }));

test("does not force a romantic dress into a commute recommendation", () => {
  const outfits = rankOutfits(garments, "通勤", 14);
  assert.equal(outfits.length, 1);
  assert.ok(outfits.every((outfit) => !outfit.itemIds.includes("seed-dress-berry")));
  assert.ok(outfits.every((outfit) => outfit.score <= 94));
  assert.match(outfits[0].reason, /直线下装收住量感/);
});

test("allows a dress and coat only when the occasion and proportions support it", () => {
  const outfits = rankOutfits(garments, "约会", 14);
  const dressLook = outfits.find((outfit) => outfit.itemIds.includes("seed-dress-berry"));
  assert.ok(dressLook);
  assert.ok(dressLook.itemIds.includes("seed-coat-charcoal"));
  assert.ok(!dressLook.itemIds.includes("seed-top-cream"));
  assert.ok(!dressLook.itemIds.includes("seed-bottom-denim"));
  assert.match(dressLook.reason, /收束的裙身为外套保留了纵向线条/);
});

test("returns three recommendations only when their base combinations differ", () => {
  const whiteShirt = {
    ...garments[0], id: "top-white-shirt", name: "白色合身衬衫", color: "白色",
    material: "棉", season: "四季", styleTags: ["经典", "通勤", "简约"],
    occasionTags: ["通勤", "会议"], favorite: false, affinity: 2.2,
  };
  const blackTrouser = {
    ...garments[1], id: "bottom-black-trouser", name: "黑色直筒西裤", color: "黑色",
    material: "羊毛混纺", styleTags: ["经典", "通勤", "极简"],
    occasionTags: ["通勤", "会议"], favorite: false, affinity: 2.5,
  };
  const outfits = rankOutfits([...garments, whiteShirt, blackTrouser], "通勤", 14);
  assert.equal(outfits.length, 3);
  const baseSignatures = outfits.map((outfit) => outfit.itemIds
    .filter((id) => id.includes("top") || id.includes("bottom"))
    .sort()
    .join("|"));
  assert.equal(new Set(baseSignatures).size, 3);
});
