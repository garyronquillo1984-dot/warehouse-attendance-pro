import { useFamily } from '../lib/family';
import { useT } from '../lib/i18n';

// [ Todos ] [ ● Gael ] [ ● Edric ] — the dashboard follows the selected child.
export function ChildSwitcher() {
  const fam = useFamily();
  const { t } = useT();
  if (fam.activeChildren.length < 2) return null;
  return (
    <div className="child-switch" role="tablist" aria-label={t.nav.children}>
      <button type="button" role="tab" aria-selected={fam.selected === 'all'} className={`chip${fam.selected === 'all' ? ' active' : ''}`} onClick={() => fam.setSelected('all')}>
        {t.nav.allChildren}
      </button>
      {fam.activeChildren.map(c => (
        <button type="button" role="tab" key={c.id} aria-selected={fam.selected === c.id} className={`chip${fam.selected === c.id ? ' active' : ''}`} onClick={() => fam.setSelected(c.id)}>
          <span className="swatch" style={{ background: c.color }} />{c.name}
        </button>
      ))}
    </div>
  );
}
