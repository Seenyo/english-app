export function PreviewBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact ? 'preview-badge preview-badge-compact' : 'preview-badge'
      }
      role="status"
    >
      <strong>PREVIEW</strong>
      {!compact && <span>固定データ・保存なし</span>}
    </div>
  );
}
