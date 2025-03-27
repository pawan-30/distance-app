import { LocationCenterFinder } from "./components/location-center-finder"

export default function Home() {
  return (
    <main className="min-h-screen p-4 md:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 text-gray-900">Location Center Finder</h1>
        <p className="text-gray-600 mb-8">
          Enter multiple locations separated by commas or new lines to find the central point.
        </p>
        <LocationCenterFinder />
      </div>
    </main>
  )
}

