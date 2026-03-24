'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  {
    href: '/avatar/new',
    label: 'Avatar',
    match: (p: string) => p.startsWith('/avatar') || p.startsWith('/pipeline'),
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/video-maker',
    label: 'Video Maker',
    match: (p: string) => p.startsWith('/video-maker'),
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
      >
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <path
          d="M7 6V18M17 6V18M2 10h3M19 10h3M2 14h3M19 14h3"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
] as const;

export default function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-16 flex-shrink-0 flex-col items-center border-r border-slate-200 bg-white py-4 gap-1">
      {/* Logo mark */}
      <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-xl bg-violet-600">
        <svg
          className="h-4 w-4 text-white"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 2a5 5 0 1 1 0 10A5 5 0 0 1 12 2zm0 12c5.33 0 8 2.67 8 4v2H4v-2c0-1.33 2.67-4 8-4z" />
        </svg>
      </div>

      {NAV.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`group flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 w-12 transition ${
              active
                ? 'bg-violet-50 text-violet-700'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            {item.icon}
            <span
              className={`text-[9px] font-semibold leading-tight text-center ${
                active
                  ? 'text-violet-700'
                  : 'text-slate-400 group-hover:text-slate-600'
              }`}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </aside>
  );
}
