"use client"

import type React from "react"

import { useEffect, useRef, useState, useCallback } from "react"
import * as d3 from "d3"
import { feature } from "topojson-client"
import { Button } from "@/components/ui/button"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
const POLL_INTERVAL = 2500

interface GeoFeature {
  type: string
  geometry: any
  properties: any
}

interface NetworkNode {
  id: string
  name: string
  ip: string
  role: "Router" | "Server" | "Client"
  lat: number
  long: number
  status: "active" | "idle" | "warning"
}

interface NetworkLink {
  source: string
  target: string
  traffic: number // MB/s - packets only flow when traffic > 0
}

interface TopologyData {
  nodes: NetworkNode[]
  links: NetworkLink[]
}

interface ApiNode {
  ip: string
  packets: number
}

interface ApiEdge {
  source: string
  target: string
  weight: number
}

interface ApiTopologyResponse {
  nodes: ApiNode[]
  edges: ApiEdge[]
  timestamp: number
}

function inferRoleFromIP(ip: string): NetworkNode["role"] {
  const parts = ip.split(".")
  const lastOctet = parseInt(parts[3] || "0", 10)
  if (lastOctet === 1) return "Router"
  if (lastOctet === 0 || lastOctet > 200) return "Server"
  return "Client"
}

function transformApiResponse(apiData: ApiTopologyResponse): TopologyData {
  const nodeMap = new Map<string, NetworkNode>()

  apiData.nodes.forEach((apiNode) => {
    const coords = getCoordinatesFromIP(apiNode.ip)
    const nodeId = `node-${apiNode.ip.replace(/\./g, "-")}`

    nodeMap.set(apiNode.ip, {
      id: nodeId,
      name: `Node ${apiNode.ip}`,
      ip: apiNode.ip,
      role: inferRoleFromIP(apiNode.ip),
      lat: coords.lat,
      long: coords.long,
      status: apiNode.packets > 0 ? "active" : "idle",
    })
  })

  const links: NetworkLink[] = apiData.edges
    .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
    .map((edge) => ({
      source: nodeMap.get(edge.source)!.id,
      target: nodeMap.get(edge.target)!.id,
      traffic: edge.weight,
    }))

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  }
}

function getCoordinatesFromIP(ip: string): { lat: number; long: number } {
  // Simple hash function for deterministic randomness
  let hash = 0
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }

  // Use hash to generate lat/long within reasonable bounds
  // Lat: -60 to 70 (avoiding extreme polar regions)
  // Long: -180 to 180
  const hash1 = Math.abs(hash)
  const hash2 = Math.abs((hash * 2654435761) & 0xffffffff) // Secondary hash

  const lat = (hash1 % 13000) / 100 - 60 // Range: -60 to 70
  const long = (hash2 % 36000) / 100 - 180 // Range: -180 to 180

  return { lat, long }
}

function createNodeFromIP(ip: string, id?: string, name?: string): NetworkNode {
  const coords = getCoordinatesFromIP(ip)
  const nodeId = id || `node-${ip.replace(/\./g, "-")}`
  const nodeName = name || `Node ${ip}`

  return {
    id: nodeId,
    name: nodeName,
    ip: ip,
    role: "Client", // Default role, can be overridden
    lat: coords.lat,
    long: coords.long,
    status: "active",
  }
}

const initialTopologyData: TopologyData = {
  nodes: [
    {
      id: "n1",
      name: "Stanford Server",
      ip: "10.144.1.1",
      role: "Server",
      lat: 37.4275,
      long: -122.1697,
      status: "active",
    },
    { id: "n2", name: "MIT Gateway", ip: "10.144.1.2", role: "Router", lat: 42.3601, long: -71.0942, status: "active" },
    { id: "n3", name: "London Node", ip: "10.144.2.5", role: "Router", lat: 51.5074, long: -0.1278, status: "active" },
    { id: "n4", name: "Berlin Client", ip: "10.144.2.10", role: "Client", lat: 52.52, long: 13.405, status: "idle" },
    {
      id: "n5",
      name: "Tokyo Router",
      ip: "10.144.3.1",
      role: "Router",
      lat: 35.6762,
      long: 139.6503,
      status: "active",
    },
    {
      id: "n6",
      name: "Singapore Hub",
      ip: "10.144.3.5",
      role: "Server",
      lat: 1.3521,
      long: 103.8198,
      status: "active",
    },
    {
      id: "n7",
      name: "Sydney Client",
      ip: "10.144.4.2",
      role: "Client",
      lat: -33.8688,
      long: 151.2093,
      status: "warning",
    },
    { id: "n8", name: "Mumbai Server", ip: "10.144.3.8", role: "Server", lat: 19.076, long: 72.8777, status: "active" },
    {
      id: "n9",
      name: "São Paulo Node",
      ip: "10.144.5.1",
      role: "Router",
      lat: -23.5505,
      long: -46.6333,
      status: "active",
    },
    { id: "n10", name: "Cairo Client", ip: "10.144.6.3", role: "Client", lat: 30.0444, long: 31.2357, status: "idle" },
    {
      id: "n11",
      name: "Toronto Gateway",
      ip: "10.144.1.15",
      role: "Router",
      lat: 43.6532,
      long: -79.3832,
      status: "active",
    },
    {
      id: "n12",
      name: "Seoul Server",
      ip: "10.144.3.12",
      role: "Server",
      lat: 37.5665,
      long: 126.978,
      status: "active",
    },
  ],
  links: [
    { source: "n1", target: "n2", traffic: 125 },
    { source: "n2", target: "n3", traffic: 89 },
    { source: "n3", target: "n4", traffic: 0 }, // No traffic - idle node
    { source: "n3", target: "n5", traffic: 67 },
    { source: "n5", target: "n6", traffic: 145 },
    { source: "n6", target: "n7", traffic: 34 },
    { source: "n5", target: "n12", traffic: 78 },
    { source: "n6", target: "n8", traffic: 92 },
    { source: "n8", target: "n10", traffic: 0 }, // No traffic - idle node
    { source: "n1", target: "n9", traffic: 56 },
    { source: "n2", target: "n11", traffic: 110 },
    { source: "n11", target: "n1", traffic: 98 },
    { source: "n3", target: "n8", traffic: 45 },
  ],
}

interface TooltipState {
  visible: boolean
  x: number
  y: number
  node: NetworkNode | null
}

const NEON_COLORS = {
  router: "#00F3FF", // Electric Cyan for routers
  endpoint: "#FF0099", // Hot Magenta for servers/clients
  edgeIdle: "rgba(100, 149, 237, 0.2)", // Low opacity grey/blue
  edgeActive: "#BD00FF", // Bright Purple for active connections
  packet: "#39FF14", // Neon Green for packets (brightest)
}

function interpolateProjection(raw0: any, raw1: any) {
  const mutate: any = d3.geoProjectionMutator((t: number) => (x: number, y: number) => {
    const [x0, y0] = raw0(x, y)
    const [x1, y1] = raw1(x, y)
    return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)]
  })
  let t = 0
  return Object.assign((mutate as any)(t), {
    alpha(_: number) {
      return arguments.length ? (mutate as any)((t = +_)) : t
    },
  })
}

export function NetworkTopology() {
  const svgRef = useRef<SVGSVGElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [progress, setProgress] = useState([0])
  const [worldData, setWorldData] = useState<GeoFeature[]>([])
  const [rotation, setRotation] = useState([0, 0])
  const [translation, setTranslation] = useState([0, 0])
  const [isDragging, setIsDragging] = useState(false)
  const [lastMouse, setLastMouse] = useState([0, 0])
  const [tooltip, setTooltip] = useState<TooltipState>({ visible: false, x: 0, y: 0, node: null })
  const packetAnimationRef = useRef<number | null>(null)
  const [packetProgress, setPacketProgress] = useState(0)
  const [isBackendConnected, setIsBackendConnected] = useState(false)

  const [topologyData, setTopologyData] = useState<TopologyData>(initialTopologyData)

  const addNodeByIP = useCallback(
    (
      ip: string,
      options?: {
        name?: string
        role?: NetworkNode["role"]
        connectTo?: string[]
      },
    ) => {
      setTopologyData((prev) => {
        // Check if node with this IP already exists
        if (prev.nodes.some((n) => n.ip === ip)) {
          return prev
        }

        const newNode = createNodeFromIP(ip)
        if (options?.name) newNode.name = options.name
        if (options?.role) newNode.role = options.role

        const newLinks: NetworkLink[] = []
        if (options?.connectTo) {
          options.connectTo.forEach((targetId) => {
            if (prev.nodes.some((n) => n.id === targetId)) {
              newLinks.push({
                source: newNode.id,
                target: targetId,
                traffic: Math.floor(Math.random() * 100) + 10, // Random initial traffic
              })
            }
          })
        }

        return {
          nodes: [...prev.nodes, newNode],
          links: [...prev.links, ...newLinks],
        }
      })
    },
    [],
  )

  useEffect(() => {
    const fetchTopology = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/topology`)
        if (!response.ok) {
          setIsBackendConnected(false)
          return
        }
        const apiData: ApiTopologyResponse = await response.json()
        setIsBackendConnected(true)
        if (apiData.nodes && apiData.nodes.length > 0) {
          setTopologyData(transformApiResponse(apiData))
        }
      } catch {
        setIsBackendConnected(false)
      }
    }

    fetchTopology()
    const intervalId = setInterval(fetchTopology, POLL_INTERVAL)
    return () => clearInterval(intervalId)
  }, [])

  const width = 800
  const height = 500

  useEffect(() => {
    const animatePackets = () => {
      setPacketProgress((prev) => (prev + 0.5) % 100)
      packetAnimationRef.current = requestAnimationFrame(animatePackets)
    }
    packetAnimationRef.current = requestAnimationFrame(animatePackets)
    return () => {
      if (packetAnimationRef.current) {
        cancelAnimationFrame(packetAnimationRef.current)
      }
    }
  }, [])

  // Load world data
  useEffect(() => {
    const loadWorldData = async () => {
      try {
        const response = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json")
        const world: any = await response.json()
        const geoData = feature(world, world.objects.countries)
        const countries = (geoData as { features: GeoFeature[] }).features
        setWorldData(countries)
      } catch (error) {
        const fallbackData = [
          {
            type: "Feature",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [-180, -90],
                  [180, -90],
                  [180, 90],
                  [-180, 90],
                  [-180, -90],
                ],
              ],
            },
            properties: {},
          },
        ]
        setWorldData(fallbackData)
      }
    }

    loadWorldData()
  }, [])

  const handleMouseDown = (event: React.MouseEvent) => {
    setIsDragging(true)
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect) {
      setLastMouse([event.clientX - rect.left, event.clientY - rect.top])
    }
  }

  const handleMouseMove = (event: React.MouseEvent) => {
    if (!isDragging) return

    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return

    const currentMouse = [event.clientX - rect.left, event.clientY - rect.top]
    const dx = currentMouse[0] - lastMouse[0]
    const dy = currentMouse[1] - lastMouse[1]

    const t = progress[0] / 100

    if (t < 0.5) {
      const sensitivity = 0.5
      setRotation((prev) => [prev[0] + dx * sensitivity, Math.max(-90, Math.min(90, prev[1] - dy * sensitivity))])
    } else {
      const sensitivityMap = 0.25
      setRotation((prev) => [prev[0] + dx * sensitivityMap, Math.max(-90, Math.min(90, prev[1] - dy * sensitivityMap))])
    }

    setLastMouse(currentMouse)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const isPointVisible = useCallback(
    (projection: any, coords: [number, number]): boolean => {
      const projected = projection(coords)
      if (!projected) return false
      const center = projection.invert?.([width / 2, height / 2])
      if (!center) return true
      const distance = d3.geoDistance(coords, center)
      return distance < Math.PI / 2
    },
    [width, height],
  )

  const generateArcPath = useCallback(
    (projection: any, source: [number, number], target: [number, number]): string | null => {
      const sourceProjected = projection(source)
      const targetProjected = projection(target)
      if (!sourceProjected || !targetProjected) return null

      // Create a great circle arc
      const interpolate = d3.geoInterpolate(source, target)
      const points: [number, number][] = []
      for (let i = 0; i <= 50; i++) {
        const point = interpolate(i / 50)
        const projected = projection(point)
        if (projected) {
          points.push(projected as [number, number])
        }
      }

      if (points.length < 2) return null

      const lineGenerator = d3
        .line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1])
        .curve(d3.curveBasis)

      return lineGenerator(points)
    },
    [],
  )

  // Initialize and update visualization
  useEffect(() => {
    if (!svgRef.current || worldData.length === 0) return

    const svg = d3.select(svgRef.current)
    svg.selectAll("*").remove()

    const t = progress[0] / 100
    const alpha = Math.pow(t, 0.5)

    const scale = d3.scaleLinear().domain([0, 1]).range([200, 120])
    const baseRotate = d3.scaleLinear().domain([0, 1]).range([0, 0])

    const projection = interpolateProjection(d3.geoOrthographicRaw, d3.geoEquirectangularRaw)
      .scale(scale(alpha))
      .translate([width / 2 + translation[0], height / 2 + translation[1]])
      .rotate([baseRotate(alpha) + rotation[0], rotation[1]])
      .precision(0.1)

    projection.alpha(alpha)

    const path = d3.geoPath(projection)

    // Graticule
    try {
      const graticule = d3.geoGraticule()
      const graticulePath = path(graticule())
      if (graticulePath) {
        svg
          .append("path")
          .datum(graticule())
          .attr("d", graticulePath)
          .attr("fill", "none")
          .attr("stroke", "#cccccc")
          .attr("stroke-width", 1)
          .attr("opacity", 0.2)
      }
    } catch (error) {}

    // Countries
    svg
      .selectAll(".country")
      .data(worldData)
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("d", (d) => {
        try {
          const pathString = path(d as any)
          if (!pathString) return ""
          if (typeof pathString === "string" && (pathString.includes("NaN") || pathString.includes("Infinity"))) {
            return ""
          }
          return pathString
        } catch (error) {
          return ""
        }
      })
      .attr("fill", "none")
      .attr("stroke", "#cccccc")
      .attr("stroke-width", 1.0)
      .attr("opacity", 1.0)
      .style("visibility", function () {
        const pathData = d3.select(this).attr("d")
        return pathData && pathData.length > 0 && !pathData.includes("NaN") ? "visible" : "hidden"
      })

    // Sphere outline
    try {
      const sphereOutline = path({ type: "Sphere" })
      if (sphereOutline) {
        svg
          .append("path")
          .datum({ type: "Sphere" })
          .attr("d", sphereOutline)
          .attr("fill", "none")
          .attr("stroke", "#222222")
          .attr("stroke-width", 1)
          .attr("opacity", 1.0)
      }
    } catch (error) {}

    const linksGroup = svg.append("g").attr("class", "network-links")

    topologyData.links.forEach((link) => {
      const sourceNode = topologyData.nodes.find((n) => n.id === link.source)
      const targetNode = topologyData.nodes.find((n) => n.id === link.target)
      if (!sourceNode || !targetNode) return

      const sourceCoords: [number, number] = [sourceNode.long, sourceNode.lat]
      const targetCoords: [number, number] = [targetNode.long, targetNode.lat]

      const arcPath = generateArcPath(projection, sourceCoords, targetCoords)
      if (!arcPath) return

      // Check visibility for globe mode
      const sourceVisible = isPointVisible(projection, sourceCoords)
      const targetVisible = isPointVisible(projection, targetCoords)
      const linkOpacity = sourceVisible || targetVisible || t > 0.3 ? 1 : 0

      const isActive = link.traffic > 0
      const strokeColor = isActive ? NEON_COLORS.edgeActive : NEON_COLORS.edgeIdle

      // Connection line with glow effect for active links
      if (isActive) {
        // Glow layer (wider, more transparent)
        linksGroup
          .append("path")
          .attr("d", arcPath)
          .attr("fill", "none")
          .attr("stroke", NEON_COLORS.edgeActive)
          .attr("stroke-width", Math.max(4, link.traffic / 30))
          .attr("opacity", linkOpacity * 0.3)
          .attr("filter", "blur(2px)")
      }

      // Main line
      linksGroup
        .append("path")
        .attr("d", arcPath)
        .attr("fill", "none")
        .attr("stroke", strokeColor)
        .attr("stroke-width", isActive ? Math.max(1.5, link.traffic / 50) : 1)
        .attr("opacity", linkOpacity * (isActive ? 0.8 : 0.4))
        .attr("stroke-dasharray", isActive ? "none" : "4,2")
    })

    const packetsGroup = svg.append("g").attr("class", "network-packets")

    topologyData.links.forEach((link, linkIndex) => {
      if (link.traffic <= 0) return

      const sourceNode = topologyData.nodes.find((n) => n.id === link.source)
      const targetNode = topologyData.nodes.find((n) => n.id === link.target)
      if (!sourceNode || !targetNode) return

      const sourceCoords: [number, number] = [sourceNode.long, sourceNode.lat]
      const targetCoords: [number, number] = [targetNode.long, targetNode.lat]

      const sourceVisible = isPointVisible(projection, sourceCoords)
      const targetVisible = isPointVisible(projection, targetCoords)
      if (!sourceVisible && !targetVisible && t < 0.3) return

      const interpolate = d3.geoInterpolate(sourceCoords, targetCoords)

      // Multiple packets per link based on traffic
      const packetCount = Math.max(1, Math.floor(link.traffic / 40))
      for (let i = 0; i < packetCount; i++) {
        const offset = (linkIndex * 17 + i * 33) % 100
        const packetT = ((packetProgress + offset) % 100) / 100
        const packetCoords = interpolate(packetT)
        const packetProjected = projection(packetCoords)

        if (packetProjected && !isNaN(packetProjected[0]) && !isNaN(packetProjected[1])) {
          const packetVisible = isPointVisible(projection, packetCoords as [number, number])
          if (packetVisible || t > 0.3) {
            packetsGroup
              .append("circle")
              .attr("cx", packetProjected[0])
              .attr("cy", packetProjected[1])
              .attr("r", 6)
              .attr("fill", NEON_COLORS.packet)
              .attr("opacity", 0.4)
              .attr("filter", "blur(3px)")

            packetsGroup
              .append("circle")
              .attr("cx", packetProjected[0])
              .attr("cy", packetProjected[1])
              .attr("r", 3)
              .attr("fill", NEON_COLORS.packet)
              .attr("opacity", 1)
          }
        }
      }
    })

    const nodesGroup = svg.append("g").attr("class", "network-nodes")

    topologyData.nodes.forEach((node) => {
      const coords: [number, number] = [node.long, node.lat]
      const projected = projection(coords)
      if (!projected || isNaN(projected[0]) || isNaN(projected[1])) return

      const visible = isPointVisible(projection, coords)
      if (!visible && t < 0.3) return

      const nodeOpacity = visible || t > 0.3 ? 1 : 0

      // Node circle with role-based colors
      const nodeSize = node.role === "Server" ? 7 : node.role === "Router" ? 6 : 5
      const nodeColor = node.role === "Router" ? NEON_COLORS.router : NEON_COLORS.endpoint

      nodesGroup
        .append("circle")
        .attr("cx", projected[0])
        .attr("cy", projected[1])
        .attr("r", nodeSize + 4)
        .attr("fill", nodeColor)
        .attr("opacity", nodeOpacity * (node.status === "idle" ? 0.15 : 0.35))
        .attr("filter", "blur(4px)")

      // Main node circle
      nodesGroup
        .append("circle")
        .attr("cx", projected[0])
        .attr("cy", projected[1])
        .attr("r", nodeSize)
        .attr("fill", node.status === "idle" ? "#333" : nodeColor)
        .attr("stroke", nodeColor)
        .attr("stroke-width", 2)
        .attr("opacity", nodeOpacity * (node.status === "idle" ? 0.5 : 1))
        .attr("cursor", "pointer")
        .attr("data-node-id", node.id)
        .on("mouseenter", function (event) {
          d3.select(this)
            .attr("r", nodeSize + 3)
            .attr("stroke-width", 3)
          const rect = svgRef.current?.getBoundingClientRect()
          if (rect) {
            setTooltip({
              visible: true,
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
              node: node,
            })
          }
        })
        .on("mouseleave", function () {
          d3.select(this).attr("r", nodeSize).attr("stroke-width", 2)
          setTooltip({ visible: false, x: 0, y: 0, node: null })
        })

      if (node.role !== "Client" && (visible || t > 0.3)) {
        const labelText = node.name.split(" ")[0]
        const labelX = projected[0] + nodeSize + 6
        const labelY = projected[1] + 3

        // Background rect for label
        nodesGroup
          .append("rect")
          .attr("x", labelX - 3)
          .attr("y", labelY - 9)
          .attr("width", labelText.length * 5.5 + 6)
          .attr("height", 14)
          .attr("rx", 3)
          .attr("fill", "rgba(0, 0, 0, 0.7)")
          .attr("opacity", nodeOpacity * 0.9)

        // Label text
        nodesGroup
          .append("text")
          .attr("x", labelX)
          .attr("y", labelY)
          .attr("font-size", "9px")
          .attr("font-family", "monospace")
          .attr("fill", "#ffffff")
          .attr("opacity", nodeOpacity)
          .text(labelText)
      }
    })
  }, [worldData, progress, rotation, translation, packetProgress, generateArcPath, isPointVisible, topologyData])

  const handleAnimate = () => {
    if (isAnimating) return

    setIsAnimating(true)
    const startProgress = progress[0]
    const endProgress = startProgress === 0 ? 100 : 0
    const duration = 2000

    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const t = Math.min(elapsed / duration, 1)

      const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      const currentProgress = startProgress + (endProgress - startProgress) * eased

      setProgress([currentProgress])

      if (t < 1) {
        requestAnimationFrame(animate)
      } else {
        setIsAnimating(false)
      }
    }

    animate()
  }

  const handleReset = () => {
    setRotation([0, 0])
    setTranslation([0, 0])
  }

  return (
    <div className="relative flex items-center justify-center w-full h-full">
      <div className="absolute top-4 left-4 z-10 font-mono text-xs space-y-1">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isBackendConnected ? "bg-green-500 animate-pulse" : "bg-yellow-500"}`}
          />
          <span className={isBackendConnected ? "text-green-400" : "text-yellow-400"}>
            {isBackendConnected ? "Live" : "Demo Mode"}
          </span>
        </div>
        <div className="text-neutral-500">
          <span className="text-neutral-400">Active Nodes:</span>{" "}
          {topologyData.nodes.filter((n) => n.status === "active").length}
        </div>
        <div className="text-neutral-500">
          <span className="text-neutral-400">Connections:</span> {topologyData.links.length}
        </div>
        <div className="text-neutral-500">
          <span className="text-neutral-400">Total Traffic:</span>{" "}
          {topologyData.links.reduce((sum, l) => sum + l.traffic, 0)} pkts
        </div>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full border rounded-lg bg-transparent border-neutral-800 cursor-grab active:cursor-grabbing"
        preserveAspectRatio="xMidYMid meet"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />

      {tooltip.visible && tooltip.node && (
        <div
          className="absolute z-20 pointer-events-none bg-black/90 border border-neutral-600 rounded-md px-3 py-2 text-xs font-mono shadow-lg"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: tooltip.x > width / 2 ? "translateX(-100%)" : "none",
            boxShadow:
              tooltip.node.role === "Router"
                ? `0 0 10px ${NEON_COLORS.router}40`
                : `0 0 10px ${NEON_COLORS.endpoint}40`,
          }}
        >
          <div className="text-white font-medium">{tooltip.node.name}</div>
          <div className="text-neutral-400 mt-1">
            <span className="text-neutral-500">IP:</span> {tooltip.node.ip}
          </div>
          <div className="text-neutral-400">
            <span className="text-neutral-500">Role:</span>{" "}
            <span style={{ color: tooltip.node.role === "Router" ? NEON_COLORS.router : NEON_COLORS.endpoint }}>
              {tooltip.node.role}
            </span>
          </div>
          <div className="text-neutral-400">
            <span className="text-neutral-500">Status:</span>{" "}
            <span
              className={
                tooltip.node.status === "active"
                  ? "text-green-400"
                  : tooltip.node.status === "warning"
                    ? "text-yellow-400"
                    : "text-neutral-500"
              }
            >
              {tooltip.node.status}
            </span>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        <Button onClick={handleAnimate} disabled={isAnimating} className="cursor-pointer min-w-[120px] rounded">
          {isAnimating ? "Animating..." : progress[0] === 0 ? "Unroll Globe" : "Roll to Globe"}
        </Button>
        <Button
          onClick={handleReset}
          variant="outline"
          className="cursor-pointer min-w-[80px] text-white border-white/20 hover:bg-white/10 bg-transparent rounded"
        >
          Reset
        </Button>
      </div>
    </div>
  )
}
