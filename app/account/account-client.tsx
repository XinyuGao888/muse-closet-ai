"use client";

import { useEffect, useState } from "react";

type AccountPayload = {
  account: {
    email: string;
    displayName: string;
    plan: string;
    aiProcessingConsent: boolean;
    privacyVersion: string;
    createdAt: string;
  } | null;
  usage: { uploadCount: number; uploadBytes: number; modelCalls: number; estimatedCostMicros: number };
  limits: { dailyUploadCount: number; dailyUploadBytes: number; dailyModelCalls: number; dailyModelBudgetMicros: number };
};

function megabytes(bytes: number) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10}MB`;
}

export function AccountClient({ signOutPath }: { signOutPath: string }) {
  const [data, setData] = useState<AccountPayload | null>(null);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("account unavailable")))
      .then((payload: AccountPayload) => setData(payload))
      .catch(() => setMessage("账户信息暂时无法读取，请刷新重试。"));
  }, []);

  async function updateConsent(value: boolean) {
    setBusy(true);
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ aiProcessingConsent: value }),
    });
    if (response.ok) {
      setData(await response.json() as AccountPayload);
      setMessage(value ? "已允许在需要时调用已配置的 AI 服务。" : "已关闭外部 AI 图片处理。基础衣柜功能不受影响。");
    } else setMessage("设置保存失败，请稍后重试。");
    setBusy(false);
  }

  async function deleteAccountData() {
    if (confirmation !== "DELETE") return;
    setBusy(true);
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const payload = await response.json() as { error?: string; signOutPath?: string };
    if (!response.ok) {
      setMessage(payload.error ?? "删除失败，请稍后重试。");
      setBusy(false);
      return;
    }
    window.location.assign(payload.signOutPath ?? signOutPath);
  }

  if (!data?.account) return <div className="account-loading">{message || "正在读取你的隐私设置…"}</div>;
  const { account, usage, limits } = data;
  return (
    <div className="account-grid">
      <section className="account-card account-card--identity">
        <p className="eyebrow">ACCOUNT</p>
        <h2>{account.displayName}</h2>
        <p>{account.email}</p>
        <div className="account-badges"><span>独立衣柜</span><span>私有图片</span><span>{account.plan === "free" ? "体验计划" : account.plan}</span></div>
      </section>

      <section className="account-card">
        <p className="eyebrow">TODAY&apos;S USAGE</p>
        <h2>今日配额</h2>
        <div className="usage-row"><span>图片上传</span><strong>{usage.uploadCount} / {limits.dailyUploadCount}</strong></div>
        <div className="usage-row"><span>图片流量</span><strong>{megabytes(usage.uploadBytes)} / {megabytes(limits.dailyUploadBytes)}</strong></div>
        <div className="usage-row"><span>AI 调用</span><strong>{usage.modelCalls} / {limits.dailyModelCalls}</strong></div>
        <div className="usage-row"><span>估算 AI 成本</span><strong>${(usage.estimatedCostMicros / 1_000_000).toFixed(3)}</strong></div>
        <small>成本为调用前的保护性估算，不代表服务商最终账单。</small>
      </section>

      <section className="account-card account-card--wide">
        <p className="eyebrow">AI & PRIVACY</p>
        <div className="privacy-toggle">
          <div><h2>允许外部 AI 图片处理</h2><p>开启后，只有执行识别、试穿或人体建模时选中的图片会发送给已配置的模型服务；关闭后自动使用本地降级能力。</p></div>
          <button className={account.aiProcessingConsent ? "toggle is-on" : "toggle"} disabled={busy} onClick={() => void updateConsent(!account.aiProcessingConsent)} aria-pressed={account.aiProcessingConsent}><span /></button>
        </div>
        <ul className="privacy-list">
          <li>所有业务查询均绑定当前登录用户ID</li>
          <li>R2图片通过鉴权接口读取，不生成公开对象地址</li>
          <li>单张、每日上传量和每日AI预算均有服务端限制</li>
          <li>隐私规则版本：{account.privacyVersion}</li>
        </ul>
      </section>

      <section className="account-card account-card--danger account-card--wide">
        <p className="eyebrow">DELETE MY DATA</p>
        <h2>删除全部 Muse 数据</h2>
        <p>此操作会永久删除衣物、搭配、偏好、日记、人体档案、试穿记录及所有已上传图片，无法恢复。</p>
        <div className="delete-row">
          <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="输入 DELETE 确认" aria-label="输入 DELETE 确认删除" />
          <button disabled={busy || confirmation !== "DELETE"} onClick={() => void deleteAccountData()}>永久删除</button>
        </div>
      </section>
      {message && <p className="account-message" role="status">{message}</p>}
    </div>
  );
}
