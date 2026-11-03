import { About } from "@/components/landing/About";
import { Contact } from "@/components/landing/Contact";
import { Hero } from "@/components/landing/Hero";
import { Services } from "@/components/landing/Services";
import { PageMeta } from "@/components/layout/PageMeta";
import { useSmoothHashScroll } from "@/hooks/use-smooth-hash-scroll";
import { publicPageMeta } from "@/lib/page-meta";

export function HomePage() {
  useSmoothHashScroll();
  const meta = publicPageMeta["/"];

  return (
    <>
      <PageMeta title={meta.title} description={meta.description} canonicalPath={meta.canonicalPath} />
      <main>
        <Hero />
        <Services />
        <About />
        <Contact />
      </main>
    </>
  );
}
