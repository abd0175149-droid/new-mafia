import './launch.css';

export const metadata = { title: 'نادي المافيا', robots: { index: false, follow: false } };

export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return <div className="ls-root" dir="rtl">{children}</div>;
}
