import { Boxes, Factory, Truck, Wheat } from 'lucide-react';
import LogoLoop from './reactbits/LogoLoop';
import { useI18n } from '../i18n';

export default function IndustriesBar() {
  const { t } = useI18n();
  const i = t.industries;
  const items = [
    { label: i.logistics, Icon: Truck },
    { label: i.agri, Icon: Wheat },
    { label: i.commodities, Icon: Boxes },
    { label: i.manufacturing, Icon: Factory },
  ];
  const logos = items.map(({ label, Icon }) => ({
    title: label,
    node: (
      <span className="inline-flex items-center gap-3 text-gray-500 transition-colors hover:text-brand-600">
        <Icon size={28} strokeWidth={1.8} />
        <span className="font-display text-2xl font-bold tracking-tight">{label}</span>
      </span>
    ),
  }));
  return (
    <section aria-label={i.aria} className="border-y border-gray-200 bg-white py-9">
      <p className="mb-6 text-center text-xs font-bold uppercase tracking-[0.18em] text-gray-400">{i.title}</p>
      <LogoLoop logos={logos} speed={45} gap={72} logoHeight={32} pauseOnHover fadeOut fadeOutColor="var(--color-white)" ariaLabel={items.map((x) => x.label).join(', ')} />
    </section>
  );
}
