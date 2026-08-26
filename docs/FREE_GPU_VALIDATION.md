# 免费 GPU 验证路径

这份流程只用于证明 ChatGarment 官方链路能够在 NVIDIA CUDA 环境运行，不把免费 Notebook 当作 Muse 的长期线上后端。

## 推荐顺序

1. 在 Kaggle Notebook 或 Google Colab 创建带 GPU 的临时环境。
2. 克隆 ChatGarment、GarmentCodeRC 和 ContourCraft-CG，并严格按照各自官方安装说明配置依赖。
3. 按 ChatGarment 官方说明手动下载预训练权重。权重不提交到 Muse 仓库，也不放入公开 R2。
4. 设置以下路径后执行预检：

   ```bash
   export CHATGARMENT_ROOT=/workspace/ChatGarment
   export GARMENTCODE_ROOT=/workspace/GarmentCodeRC
   export CHATGARMENT_WEIGHTS=/workspace/ChatGarment/checkpoints/try_7b_lr1e_4_v3_garmentcontrol_4h100_v4_final/pytorch_model.bin
   python services/chatgarment-adapter/preflight.py
   ```

5. 先运行 ChatGarment 仓库自带的图片重建示例，确认能输出 GarmentCode 纸样 JSON。
6. 再执行官方 `run_garmentcode_sim.py`，确认纸样可以缝合并生成立体服装。
7. 选取不包含用户隐私的结果作为 Muse 预生成样例；记录 GPU 型号、显存占用、耗时和失败原因。
8. 只有上述链路稳定后，才把它封装进 `services/chatgarment-adapter` 的 runner。

## 免费环境的边界

- 免费 GPU 型号、显存和可用时长不保证，完整模型可能因显存不足而失败。
- 免费 Colab/Kaggle 适合交互式验证和预生成样例，不适合给公开网站持续提供 API。
- 不在 Notebook 中放入 Muse 的 Supabase、Cloudflare、R2 或生产密钥。
- 不上传真实用户照片；验证阶段只使用官方示例或已获得明确授权的测试图片。

## 转为线上推理的验收条件

- 同一测试集连续完成至少 10 次，任务成功率不低于 90%。
- 失败时能返回结构化错误，不生成伪造结果。
- 输出包含 `result.glb`，可选包含 `preview.png`。
- 单任务显存峰值、生成耗时和成本均已记录。
- Muse 的每用户限制、全站预算、并发数和超时均已启用。
