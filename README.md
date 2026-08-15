# Muse Closet

Muse Closet 是一个可上线、也适合作为面试作品讲解的 AI 云衣柜 MVP。它把衣物建档、穿搭决策、二维试穿和偏好学习串成一条完整闭环。

## 第一期能力

- 上传衣物照片，在浏览器端对纯净背景做自动抠图并提取主色
- 调用可配置的 FashionSigLIP 服务识别品类、材质、季节、风格与场合；服务不可用时使用可演示的降级识别
- 用户确认或修改 AI 结果后，将结构化信息存入 D1、图片存入 R2
- 搜索、品类筛选、收藏与穿着次数统计
- 根据场合、温度、指定单品及用户偏好生成 3 套搭配
- 手动替换 AI 搭配中的单品并保存
- 上装和连衣裙二维试穿；可接 FASHN VTON，未配置时使用本地合成预览
- 收集喜欢、拒绝、保存、实际穿着四类反馈，并将不同权重写回下一轮推荐排序

## 第二期能力

- 四种建档入口：衣物照片、吊牌 OCR、条码/二维码、商品链接
- 保存品牌、货号、原始识别文字和商品来源，搜索时也能命中品牌及编码
- 商品链接提取标题、站点品牌、货号和高清主图；可接专用淘宝、京东、得物适配服务
- 上装、下装、连衣裙和外套的多件组合二维试穿，同品类自动替换
- 内置可收藏的灵感穿搭库，并把灵感的场景、风格和品类映射到用户真实衣柜
- 完整偏好画像：分别呈现风格、颜色、场景权重，支持主动风格、屏蔽颜色、版型和探索度设置
- 显式偏好与实际穿着、保存、喜欢、拒绝共同进入下一轮推荐排序

## 第三期能力

- 支持身体参数或正面/侧面照片两种人体建模入口
- 默认提供可旋转、体型比例实时变化的参数化 3D 人体，不依赖模型密钥即可演示
- 可接 `SAM3D_BODY_URL` 输出照片重建人体网格与渲染图
- 可接 `MHR_URL` 完成参数生成人体与真实 3D 服装模拟
- 支持上装、下装、连衣裙、外套分层套用，并持久化 3D 试穿会话
- 明确区分参数化预览、SAM 3D Body 和 MHR 模式，避免把降级结果伪装成真实物理仿真

## 技术结构

- Vinext / React 19 / TypeScript
- Cloudflare Worker + D1 + R2
- FashionSigLIP 推理服务适配层：`app/api/analyze/route.ts`
- FASHN VTON 适配层：`app/api/try-on/route.ts`
- 可解释推荐与反馈排序：`lib/wardrobe.ts`、`app/api/feedback/route.ts`
- 多源建档适配层：`app/api/intake/route.ts`
- 灵感与偏好：`app/api/inspirations/route.ts`、`app/api/preferences/route.ts`
- 3D Body / MHR 适配层：`app/api/body-model/route.ts`
- 数据表：`garments`、`outfits`、`feedback`、`garment_sources`、`inspirations`、`preference_profiles`、`body_models`、`tryon_sessions`

## 本地运行

需要 Node.js `>=22.13.0` 和 pnpm。

```bash
pnpm install
pnpm run dev
pnpm test
```

本地开发默认使用 Miniflare 提供 D1 和 R2。首次访问会自动建表并写入一组演示衣物。

## 接入真实模型

复制 `.env.example` 为本地环境文件，再配置：

- `FASHION_SIGLIP_URL`：接收 multipart `image`，返回名称、品类、材质、季节、风格标签等 JSON 的服务地址
- `FASHION_SIGLIP_TOKEN`：可选 Bearer Token
- `FASHN_VTON_URL`：接收 multipart `person`、`garment`、`category`，直接返回结果图片的服务地址
- `FASHN_VTON_TOKEN`：可选 Bearer Token
- `OCR_BARCODE_URL` / `OCR_BARCODE_TOKEN`：吊牌 OCR 与条码商品解析服务
- `PRODUCT_IMPORT_URL` / `PRODUCT_IMPORT_TOKEN`：官网及电商商品导入适配服务
- `SAM3D_BODY_URL` / `SAM3D_BODY_TOKEN`：正面/侧面照片到 3D 人体服务
- `MHR_URL` / `MHR_TOKEN`：参数人体与真实服装模拟服务

部署环境中的密钥应配置在平台变量中，不要提交到仓库。

## 面试讲解主线

1. 把“衣柜里有什么”从非结构化照片变成可检索的数据资产。
2. 将天气、场合、指定单品与显式反馈合并为可解释排序，而不是只生成一段文案。
3. 用喜欢 `+1.5`、拒绝 `-2.5`、保存 `+2.5`、实际穿着 `+4` 区分反馈强弱，使下一轮排序真实变化。
4. 将高成本模型放在适配层后面，并提供稳定降级路径，让作品在没有模型密钥时仍可完整演示。
5. 二期把“图片”升级为带来源、品牌和商品编码的数据资产；三期把 2D 展示升级为可插拔的 3D 推理管线。
