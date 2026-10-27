interface Props {
  eyebrow: string
  title: string
  version: string
  date: string
  children: React.ReactNode
}

export default function LegalPage({ eyebrow, title, version, date, children }: Props) {
  return (
    <main className="flex-1 py-20">
      <div className="mx-auto max-w-[720px] px-6">
        <p className="text-[13px] font-medium uppercase tracking-[0.08em] text-[#525252] mb-5">
          {eyebrow}
        </p>
        <h1 className="text-[48px] font-bold tracking-[-0.02em] text-[#db1230] leading-tight">
          {title}
        </h1>
        <p className="mt-3 text-[14px] text-[#737373]">
          {version} — Effective {date}
        </p>
        <div className="mt-12 prose-legal">
          {children}
        </div>
      </div>

      <style>{`
        .prose-legal h2 {
          font-size: 22px;
          font-weight: 700;
          color: #FFFFFF;
          margin-top: 48px;
          margin-bottom: 16px;
          letter-spacing: -0.01em;
        }
        .prose-legal h3 {
          font-size: 17px;
          font-weight: 600;
          color: #FFFFFF;
          margin-top: 28px;
          margin-bottom: 10px;
        }
        .prose-legal p {
          font-size: 16px;
          color: #C8D8E8;
          line-height: 1.75;
          margin-bottom: 14px;
        }
        .prose-legal ul {
          margin: 12px 0 16px 0;
          padding-left: 20px;
          list-style: disc;
        }
        .prose-legal li {
          font-size: 15px;
          color: #C8D8E8;
          line-height: 1.7;
          margin-bottom: 6px;
        }
        .prose-legal .definition-row {
          display: flex;
          gap: 16px;
          padding: 10px 0;
          border-bottom: 1px solid #1E3050;
          font-size: 15px;
          color: #C8D8E8;
        }
        .prose-legal .definition-term {
          font-weight: 600;
          color: #FFFFFF;
          width: 180px;
          shrink: 0;
        }
        .prose-legal .important {
          background: #0F1F38;
          border-left: 3px solid #DC1430;
          padding: 16px 20px;
          margin: 20px 0;
          border-radius: 0 8px 8px 0;
        }
        .prose-legal .important p {
          margin-bottom: 0;
          font-size: 14px;
          color: #C8D8E8;
        }
      `}</style>
    </main>
  )
}
