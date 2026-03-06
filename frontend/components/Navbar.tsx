import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="w-full border-b border-white/10 bg-white/5">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-white font-bold text-lg hover:text-white/80 transition-colors">
          YouTube to Article
        </Link>
        <Link
          href="/articles"
          className="text-white/50 hover:text-white text-sm transition-colors"
        >
          Published Articles
        </Link>
      </div>
    </nav>
  );
}
