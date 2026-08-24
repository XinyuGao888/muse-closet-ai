# Muse Closet

Muse Closet 是一个可上线、也适合作为面试作品讲解的 AI 云衣柜 MVP。它把衣物建档、穿搭决策、二维试穿和偏好学习串成一条完整闭环。

- [在线体验（Cloudflare 正式站）](https://muse-closet-ai.2307551787.workers.dev/)
- [Sites 备份站](https://muse-closet-ai.jazzy-root-7273.chatgpt.site/)

正式站首页公开可访问；通过 Supabase 邮箱登录后，每位用户进入独立衣柜。首次登录会自动生成 6 件带实物图和来源信息的演示单品，其中上装与连衣裙可直接用于二维试穿体验。

## 多用户与隐私边界

- 公共首页允许所有访客查看产品能力；个人衣柜使用 Supabase 邮箱魔法链接登录，应用本身不保存密码
- D1 中的衣物、搭配、偏好、日历、试穿、日记和分析记录全部带 `user_id`，所有读写查询均绑定当前登录用户
- R2 对象使用用户专属路径；图片不暴露公开桶地址，只能通过校验当前用户所有权的 API 读取，并返回 `private, no-store`
- 单张图片默认上限 8MB；每位用户默认每天最多 40 个上传文件、100MB 上传量
- 外部 AI 图片处理默认关闭；用户在“账户与隐私”主动同意后才会调用已配置的识别、试穿、3D 或视觉服务
- 每位用户默认每天最多 20 次外部模型调用，并设置 300,000 微单位的估算成本上限；超过后自动使用本地推荐或降级预览
- “账户与隐私”页可查看当日用量、关闭外部 AI 处理，并永久删除全部 D1 记录和 R2 图片
- Worker 统一拒绝未登录 API、跨站写请求和过大的请求体，并附加防嵌入、来源限制和 MIME 嗅探保护头

正式站使用 Supabase Auth 校验登录身份，Cloudflare Worker 只接受有效的 Supabase JWT；Sites 版本作为备份入口保留。若未来增加 Apple、Google 或微信登录，继续由经过审计的身份服务托管，不在应用内自行保存密码。

## P0 日常使用闭环

- 月历直接展示每日搭配缩略图；支持拖拽或点选安排日期，并一键按伦敦逐日天气生成下周一到周五 5 套
- 当天计划可标记“实际穿着”，穿着事件、次数、最近穿着日期、偏好分和衣物状态同步更新
- 七种衣物状态：可穿、已穿待洗、清洗中、晾晒中、收纳中、借出、维修中；不可用衣物在推荐和试穿选择中自动排除
- 首页支持自然语言和浏览器语音输入，抽取日期、地点、天气、场合、正式度、颜色与指定单品，返回 3 套带理由的方案
- 最多 20 张照片批量建档，提供任务状态、批量确认、原图/抠图/商品图封面和基于已保存原图的单件重识别
- 可配置 `BATCH_SEGMENT_URL` 实现一张图拆分多件衣物；没有服务时稳定降级为一图一件的审核候选
- 试穿历史保存进度、失败状态与结果，支持重试、重新生成、最终造型收藏、A/B 滑动比较和“与上一次相比”
- 衣柜仪表盘统计高低频单品、30/60/90 天未穿、颜色/品类/季节、组合参与度、孤立单品和基础款缺口

## P1 差异化能力

- 自由搭配画布支持拖入、触屏/鼠标移动、键盘微调、缩放、旋转和前后层级，保存时生成完整图片式 Outfit Card
- 单品关系网络汇总历史搭配、真实穿着日期、常用场合、共现单品和关系分，并为当前单品生成 3 个新搭法
- “买不买”助手将候选商品与整个衣柜、偏好画像和身体档案交叉判断，输出买/不买/降价再买、重复品、搭配潜力、替代品、推荐尺码和购买前二维试穿
- 浏览器自动定位后读取实际天气，早晨自动重排推荐；支持前一晚、降温和下雨提醒及页面开启期间的系统通知
- 真人穿搭日记把镜子自拍与计划搭配、虚拟试穿关联，记录松紧度、舒适度、好评和预期差异，并把结构化信号写回偏好模型
- 衣橱洞察进一步呈现理论合适但从未实际穿着的计划、最受好评造型以及虚拟与真人效果的对照次数

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
- 参数人体支持体型、肤色、发型、发色、肩型和站姿等精细特征，并保留多个人体档案
- 照片人体把正面/侧面参考照安全保存到用户专属 R2 空间，支持随时删除原图但保留人体参数
- 默认提供可旋转、体型比例实时变化的参数化 3D 人体，不依赖模型密钥即可演示
- 可接 `SAM3D_BODY_URL` 输出照片重建人体网格与渲染图
- 可接 `MHR_URL` 完成参数生成人体与真实 3D 服装模拟
- 支持上装、下装、连衣裙、外套、鞋履和配饰分层套用，并持久化 3D 试穿会话
- Style Twin 从潮人灵感库提取配色、层次、比例和场景语言，结合身体比例、个人偏好和真实衣柜生成 3 套可解释方案
- 喜欢、拒绝、保存和 3D 试穿反馈会回写衣物亲和度与偏好信号，调整下一轮 Style Twin 排序
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
- 潮人风格映射与学习闭环：`app/api/style-twin/route.ts`
- 日历、自然语言、批量任务与分析：`app/api/calendar`、`app/api/style-query`、`app/api/intake-jobs`、`app/api/analytics`
- P1 差异化模块：`app/api/outfit-canvas`、`app/api/garment-relations`、`app/api/shopping-advisor`、`app/api/reminders`、`app/api/diary`
- 数据表：`garments`、`outfits`、`feedback`、`garment_sources`、`inspirations`、`preference_profiles`、`body_models`、`tryon_sessions`、`style_twin_sessions`、`wear_events`、`outfit_plans`、`intake_jobs`、`intake_items`、`outfit_cards`、`shopping_assessments`、`reminder_preferences`、`outfit_diaries`

## 本地运行

需要 Node.js `>=22.13.0` 和 pnpm。

```bash
pnpm install
pnpm run dev
pnpm test
```

本地开发默认使用 Miniflare 提供 D1 和 R2。首次访问会自动建表并写入一组演示衣物。

本地地址允许使用隔离的 `demo-user` 便于开发；公开部署环境不会回退到共享演示用户，未登录 API 会返回 `401`。

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
- `BATCH_SEGMENT_URL` / `BATCH_SEGMENT_TOKEN`：多衣物分割服务；返回候选属性、透明单品图及可选商品图地址
- `OUTFIT_DIARY_VISION_URL` / `OUTFIT_DIARY_VISION_TOKEN`：可选真人穿搭视觉分析服务；未配置时仍使用用户确认的松紧度、舒适度和好评信号学习
- `STYLE_TWIN_URL` / `STYLE_TWIN_TOKEN`：可选潮人风格理解与重排服务；未配置时使用内置可解释风格映射引擎

部署环境中的密钥应配置在平台变量中，不要提交到仓库。

生产配额可以通过 `MAX_REQUEST_BYTES`、`MAX_IMAGE_BYTES`、`DAILY_UPLOAD_COUNT`、`DAILY_UPLOAD_BYTES`、`DAILY_MODEL_CALLS` 和 `DAILY_MODEL_BUDGET_MICROS` 调整；`GLOBAL_DAILY_MODEL_CALLS` 与 `GLOBAL_DAILY_MODEL_BUDGET_MICROS` 再限制全站每日总调用和总预算，避免用户数增长后总成本失控。成本微单位是保护性估算，不替代模型服务商账单。

## 面试讲解主线

1. 把“衣柜里有什么”从非结构化照片变成可检索的数据资产。
2. 将天气、场合、指定单品与显式反馈合并为可解释排序，而不是只生成一段文案。
3. 用喜欢 `+1.5`、拒绝 `-2.5`、保存 `+2.5`、实际穿着 `+4` 区分反馈强弱，使下一轮排序真实变化。
4. 将高成本模型放在适配层后面，并提供稳定降级路径，让作品在没有模型密钥时仍可完整演示。
5. 二期把“图片”升级为带来源、品牌和商品编码的数据资产；三期把 2D 展示升级为可插拔的 3D 推理管线。
6. P0 把低频生成工具升级成日历驱动的每日系统，并用衣物可用状态保证推荐结果真正能穿。
7. P1 从“穿什么”扩展到“怎么创作、该不该买、穿后是否真的好”，用购买前和穿后数据建立产品差异化。
8. AI Style Twin 不复制潮人单品，而是抽象穿搭语言，再用用户的身体比例、偏好和真实衣柜完成个性化重组。
