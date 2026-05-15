import { AppState } from '../types';
import { formatBytes } from '../utils/format';

interface Props {
  state: AppState;
}

export function Sidebar({ state }: Props) {
  const { images, groups } = state;
  const imageMap = new Map(images.map((img) => [img.id, img]));

  const groupsWithData = groups.map((group) => {
    const resolvedSlots = group.slots
      .map((sl) => ({ slot: sl, image: imageMap.get(sl.imageId) }))
      .filter((s) => !!s.image) as Array<{ slot: typeof group.slots[0]; image: typeof images[0] }>;

    const totalSize = resolvedSlots.reduce((acc, { image }) => acc + image.size, 0);
    const titleImage = resolvedSlots[0]?.image ?? null;
    const pageCount = resolvedSlots.length;
    // Count unique images (may have duplicates)
    const uniqueImages = new Set(resolvedSlots.map(({ slot }) => slot.imageId)).size;

    return { group, resolvedSlots, totalSize, titleImage, pageCount, uniqueImages };
  });

  const totalEstimated = groupsWithData.reduce((acc, g) => acc + g.totalSize, 0);
  const totalPages = groupsWithData.reduce((acc, g) => acc + g.pageCount, 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">Output Summary</div>
      </div>

      <div className="sidebar-body">
        {groupsWithData.length === 0 && (
          <div className="sidebar-empty">
            <span>📁</span>
            <span>No groups yet</span>
          </div>
        )}

        {groupsWithData.map(({ group, totalSize, titleImage, pageCount, uniqueImages }) => (
          <div key={group.id} className="sidebar-group-row">
            <div className="sidebar-group-name">{group.name}</div>

            {titleImage && (
              <div className="sidebar-cover-row">
                <span className="sidebar-cover-icon">★</span>
                <span className="sidebar-cover-name" title={titleImage.name}>
                  {titleImage.name.length > 22
                    ? titleImage.name.slice(0, 20) + '…'
                    : titleImage.name}
                </span>
              </div>
            )}

            <div className="sidebar-group-stats">
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">pages</span>
                <span className="sidebar-stat-value">{pageCount}</span>
              </div>
              {uniqueImages !== pageCount && (
                <div className="sidebar-stat">
                  <span className="sidebar-stat-label">unique imgs</span>
                  <span className="sidebar-stat-value">{uniqueImages}</span>
                </div>
              )}
              <div className="sidebar-stat">
                <span className="sidebar-stat-label">est. size</span>
                <span className="sidebar-stat-value size">
                  {totalSize > 0 ? `~${formatBytes(totalSize)}` : '—'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-total">
          <span className="sidebar-total-label">Total size</span>
          <span className="sidebar-total-value">~{formatBytes(totalEstimated)}</span>
        </div>
        <div className="sidebar-total" style={{ marginTop: 3 }}>
          <span className="sidebar-total-label">PDFs × pages</span>
          <span className="sidebar-total-value">
            {groups.length} × {totalPages}
          </span>
        </div>
        <div className="sidebar-note" style={{ marginTop: 8 }}>
          Page 1 of each group is the cover.
          Estimates based on source file sizes.
        </div>
      </div>
    </aside>
  );
}
