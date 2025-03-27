"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, MapPin, Info } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import * as L from 'leaflet';
//import { Map, TileLayer } from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Define types for our locations
interface Location {
  address: string
  fullAddress: string
  lat: number
  lon: number
}

interface CenterLocation {
  lat: number
  lon: number
  address?: string
}

export function LocationCenterFinder() {
  const [locations, setLocations] = useState<string>("")
  const [cityContext, setCityContext] = useState<string>("")
  const [geocodedLocations, setGeocodedLocations] = useState<Location[]>([])
  const [centerLocation, setCenterLocation] = useState<CenterLocation | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const centerMarkerRef = useRef<any>(null)

  // Initialize the map
  useEffect(() => {
    if (typeof window !== "undefined" && mapRef.current && !mapInstanceRef.current) {
      import("leaflet").then((L) => {
        // Non-null assertion or type guard
        if (mapRef.current) {
          // Create map instance
          const map = L.map(mapRef.current).setView([40, -95], 4);
  
          // Add tile layer (OpenStreetMap)
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          }).addTo(map);
  
          mapInstanceRef.current = map;
        }
      });
    }
  }, []);

  // Update map when locations change
  useEffect(() => {
    if (mapInstanceRef.current && geocodedLocations.length > 0) {
      import("leaflet").then((L) => {
        // Clear existing markers
        markersRef.current.forEach((marker) => marker.remove())
        markersRef.current = []

        // Add markers for each location
        const bounds = L.latLngBounds([])

        geocodedLocations.forEach((location) => {
          const marker = L.marker([location.lat, location.lon])
            .addTo(mapInstanceRef.current)
            .bindPopup(`<strong>${location.address}</strong><br>${location.fullAddress}`)

          markersRef.current.push(marker)
          bounds.extend([location.lat, location.lon])
        })

        // Fit map to bounds
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50] })
        }
      })
    }
  }, [geocodedLocations])

  // Update center marker when center location changes
  useEffect(() => {
    if (mapInstanceRef.current && centerLocation) {
      import("leaflet").then((L) => {
        // Remove existing center marker
        if (centerMarkerRef.current) {
          centerMarkerRef.current.remove()
        }

        // Create custom icon for center marker
        const centerIcon = L.divIcon({
          html: `<div class="center-marker"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" class="text-red-500"><circle cx="12" cy="10" r="3"/><path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 7 8 11.7z"/></svg></div>`,
          className: "center-marker-container",
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        })

        // Add center marker
        centerMarkerRef.current = L.marker([centerLocation.lat, centerLocation.lon], { icon: centerIcon })
          .addTo(mapInstanceRef.current)
          .bindPopup(centerLocation.address || "Center Location")
          .openPopup()
      })
    }
  }, [centerLocation])

  // Geocode a single address
  const geocodeAddress = async (address: string): Promise<Location | null> => {
    try {
      // Add city context if provided
      let searchAddress = address.trim()
      if (cityContext && !searchAddress.toLowerCase().includes(cityContext.toLowerCase())) {
        searchAddress = `${searchAddress}, ${cityContext}`
      }

      const encodedAddress = encodeURIComponent(searchAddress)
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&addressdetails=1`,
      )

      if (!response.ok) {
        throw new Error(`Geocoding failed for address: ${address}`)
      }

      const data = await response.json()

      if (data.length === 0) {
        throw new Error(`No results found for address: ${address}`)
      }

      // Check if the result is in the expected city if city context is provided
      let isInCity = true
      if (cityContext && data[0].address) {
        const resultCity =
          data[0].address.city || data[0].address.town || data[0].address.county || data[0].address.state

        const cityContextLower = cityContext.toLowerCase()
        const resultCityLower = resultCity ? resultCity.toLowerCase() : ""

        // If city doesn't match and we can't find the city context in the display name
        if (
          !resultCityLower.includes(cityContextLower.split(",")[0]) &&
          !data[0].display_name.toLowerCase().includes(cityContextLower)
        ) {
          isInCity = false
          setWarnings((prev) => [
            ...prev,
            `Warning: Result for "${address}" may be outside the specified city context.`,
          ])
        }
      }

      return {
        address: address.trim(),
        fullAddress: data[0].display_name,
        lat: Number.parseFloat(data[0].lat),
        lon: Number.parseFloat(data[0].lon),
      }
    } catch (error) {
      console.error(`Error geocoding address "${address}":`, error)
      return null
    }
  }

  // Reverse geocode coordinates to get address
  const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`,
      )

      if (!response.ok) {
        throw new Error(`Reverse geocoding failed`)
      }

      const data = await response.json()

      if (!data || !data.display_name) {
        throw new Error(`No results found for coordinates`)
      }

      return data.display_name
    } catch (error) {
      console.error(`Error reverse geocoding:`, error)
      return "Unknown location"
    }
  }

  // Calculate the center location using a more accurate method
  const calculateCenterLocation = (locations: Location[]): CenterLocation => {
    // If we have city context, prioritize locations that match the city
    if (cityContext && locations.length > 2) {
      // Filter locations that seem to be in the specified city
      const cityContextLower = cityContext.toLowerCase()
      const cityLocations = locations.filter((loc) => loc.fullAddress.toLowerCase().includes(cityContextLower))

      // If we have enough locations in the city, use only those
      if (cityLocations.length >= 2) {
        locations = cityLocations
      }
    }

    // Convert lat/lon to radians for more accurate calculation
    const radians = locations.map((loc) => ({
      lat: (loc.lat * Math.PI) / 180,
      lon: (loc.lon * Math.PI) / 180,
    }))

    // Calculate the average of x, y, z coordinates (center of mass on a sphere)
    let x = 0
    let y = 0
    let z = 0

    for (const coord of radians) {
      x += Math.cos(coord.lat) * Math.cos(coord.lon)
      y += Math.cos(coord.lat) * Math.sin(coord.lon)
      z += Math.sin(coord.lat)
    }

    x /= radians.length
    y /= radians.length
    z /= radians.length

    // Convert average back to lat/lon
    const lon = Math.atan2(y, x)
    const hyp = Math.sqrt(x * x + y * y)
    const lat = Math.atan2(z, hyp)

    return {
      lat: (lat * 180) / Math.PI,
      lon: (lon * 180) / Math.PI,
    }
  }

  // Handle form submission
  const handleFindCenter = async () => {
    setError(null)
    setWarnings([])
    setLoading(true)

    try {
      // Split input by commas or new lines
      const addressList = locations
        .split(/[\n,]+/)
        .map((addr) => addr.trim())
        .filter((addr) => addr.length > 0)

      if (addressList.length < 2) {
        throw new Error("Please enter at least two locations")
      }

      // Geocode all addresses with a small delay between requests to avoid rate limiting
      const geocodedResults: Location[] = []

      for (const address of addressList) {
        // Add a small delay between requests to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000))

        const result = await geocodeAddress(address)
        if (result) {
          geocodedResults.push(result)
        }
      }

      if (geocodedResults.length < 2) {
        throw new Error("Could not geocode enough valid addresses. Please check your input.")
      }

      // Set geocoded locations
      setGeocodedLocations(geocodedResults)

      // Calculate center
      const center = calculateCenterLocation(geocodedResults)

      // Get address for center location
      const centerAddress = await reverseGeocode(center.lat, center.lon)
      setCenterLocation({
        ...center,
        address: centerAddress,
      })
    } catch (err: any) {
      setError(err.message || "An error occurred while processing your request")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="locations" className="block text-sm font-medium text-gray-700 mb-1">
                  Enter Locations
                </label>
                <Textarea
                  id="locations"
                  placeholder="Enter locations separated by commas or new lines
Example:
Connaught Place, Delhi
Lajpat Nagar, Delhi
Karol Bagh, Delhi"
                  className="min-h-[150px]"
                  value={locations}
                  onChange={(e) => setLocations(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="cityContext" className="block text-sm font-medium text-gray-700 mb-1">
                  City Context (recommended)
                </label>
                <Input
                  id="cityContext"
                  type="text"
                  placeholder="e.g. Delhi, India"
                  value={cityContext}
                  onChange={(e) => setCityContext(e.target.value)}
                />
                <p className="mt-1 text-sm text-gray-500">Add city name for more accurate results within a city</p>
              </div>

              <Button onClick={handleFindCenter} disabled={loading || !locations.trim()} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Finding Center...
                  </>
                ) : (
                  <>
                    <MapPin className="mr-2 h-4 w-4" />
                    Find Center Location
                  </>
                )}
              </Button>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {warnings.length > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <div className="text-sm text-amber-600">
                      {warnings.map((warning, index) => (
                        <p key={index}>{warning}</p>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {centerLocation && (
                <div className="p-4 bg-gray-100 rounded-md">
                  <h3 className="font-medium mb-2">Center Location:</h3>
                  <p className="font-medium text-gray-900 mb-2">{centerLocation.address || "Location found"}</p>
                  <p className="text-xs text-gray-500">
                    Coordinates: {centerLocation.lat.toFixed(6)}, {centerLocation.lon.toFixed(6)}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <Card className="h-full">
          <CardContent className="p-0 h-full">
            <div ref={mapRef} className="w-full h-[500px] rounded-md overflow-hidden" />
          </CardContent>
        </Card>
      </div>

      {geocodedLocations.length > 0 && (
        <div className="md:col-span-2">
          <Card>
            <CardContent className="pt-6">
              <h3 className="font-medium mb-2">Geocoded Locations:</h3>
              <ul className="space-y-2">
                {geocodedLocations.map((loc, index) => (
                  <li key={index} className="flex items-start">
                    <MapPin className="h-5 w-5 mr-2 text-gray-500 mt-0.5" />
                    <span>
                      <span className="font-medium">{loc.address}</span>
                      <span className="text-sm text-gray-500 block">{loc.fullAddress}</span>
                      <span className="text-xs text-gray-400 block">
                        Lat: {loc.lat.toFixed(6)}, Lon: {loc.lon.toFixed(6)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

