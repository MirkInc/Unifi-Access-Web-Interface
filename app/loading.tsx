export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="card px-6 py-5 flex items-center gap-3">
        <span
          className="w-4 h-4 rounded-full border-2 border-[#006FFF] border-t-transparent animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm text-gray-600">Loading page...</p>
      </div>
    </div>
  )
}
