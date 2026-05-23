// Topic page — ISR, 60s revalidation (DESIGN-001 §9).
export const revalidate = 60;

export default async function TopicPage({ params }: { params: { slug: string } }) {
  // TODO(DESIGN §9): fetch GET /topics/:slug and /topics/:slug/polls?sort=trending.
  return (
    <main>
      <h1>Topic: {params.slug}</h1>
      {/* TODO(DESIGN §9): topic header + <PollFeed /> */}
    </main>
  );
}
