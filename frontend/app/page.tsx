import { GlobeToMapTransform } from "@/components/globe-to-map-transform"

export default function Demo22Page() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-[#1a1a1a]">
      <div className="relative flex flex-col h-[600px] w-[840px] rounded-2xl p-4 justify-stretch items-stretch gap-2 overflow-clip bg-neutral-950">
        <div className="flex flex-col gap-1 my-1">
          <h3 className="text-white mx-2">The 144 Network</h3>
        </div>
        <div className="flex p-2 w-full flex-1 min-h-32 justify-center items-center">
          <GlobeToMapTransform />
        </div>
      </div>
    </div>
  )
}
