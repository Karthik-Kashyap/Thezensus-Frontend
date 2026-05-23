import { api } from "@/lib/api";

// Home feed — ISR, 30s revalidation (DESIGN-001 §9).
export const revalidate = 30;

export default async function HomePage() {
  // TODO(DESIGN §9): const { polls } = await api.get("/polls?sort=trending&limit=20");
  void api;
  return (
    <main>
      <h1>Trending polls</h1>
      {/* TODO(DESIGN §9): <PollFeed initialPolls={polls} /> */}
    </main>
  );
}
