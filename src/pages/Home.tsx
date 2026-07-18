import { LoginButton, useAuth } from '@/features/auth';
import { Dashboard } from './Dashboard';

export function Home() {
  const { user, isLoading } = useAuth();
  if (!isLoading && user) return <Dashboard />;

  return (
    <div className="landing-grid min-h-[calc(100vh-8rem)] items-center py-10 sm:py-16">
      <section>
        <p className="eyebrow">Your daily English loop</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-black leading-[0.98] tracking-[-0.045em] text-teal-950 sm:text-7xl">
          英語を、
          <br />
          <span className="text-coral-600">毎日の習慣</span>に。
        </h1>
        <p className="mt-7 max-w-xl text-lg font-bold leading-8 text-teal-800">
          あなたの現在地を測り、専属AIが次の一歩をつくる、個人用の英語学習アプリです。
        </p>
        <div className="mt-8">
          <LoginButton />
        </div>
      </section>

      <aside className="landing-puzzle" aria-hidden="true">
        <div className="word-tile tile-one">keep</div>
        <div className="word-tile tile-two">going</div>
        <div className="word-tile tile-three">every</div>
        <div className="word-tile tile-four">day.</div>
        <div className="puzzle-ring" />
      </aside>
    </div>
  );
}
