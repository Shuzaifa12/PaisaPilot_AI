import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white p-6">
      <h2 className="text-xl font-bold mb-2">Page Not Found</h2>
      <p className="text-slate-400 mb-4 text-xs">Could not find requested resource</p>
      <Link href="/" className="px-4 py-2 bg-teal-600 rounded-lg text-xs font-semibold hover:bg-teal-700">
        Return Home
      </Link>
    </div>
  );
}
