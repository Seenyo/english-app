export function DryRunBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? 'dry-run-banner dry-run-banner-compact' : 'dry-run-banner'}
      role="status"
    >
      <strong>DRY RUN</strong>
      {!compact && <span>この結果は現在のCEFRには反映されません</span>}
    </div>
  );
}
