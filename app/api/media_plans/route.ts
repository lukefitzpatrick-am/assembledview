import { NextResponse } from 'next/server';

// Define the type for a MediaPlan object to ensure type safety
// This should match the type definition in your page.tsx
type MediaPlan = {
  id: number;
  mp_client_name: string;
  mp_campaignname: string;
  mp_mba_number: string; // Added for new table requirement
  mp_version: number;     // Added for "latest version" logic
  mp_brand: string;
  mp_campaignstatus: string; // e.g., "Booked", "Approved", "Completed"
  mp_campaigndates_start: string;
  mp_campaigndates_end: string;
  mp_campaignbudget: number;
  // Keep your boolean media type fields as they are
  mp_television: boolean;
  mp_radio: boolean;
  mp_newspaper: boolean;
  mp_magazines: boolean;
  mp_ooh: boolean;
  mp_cinema: boolean;
  mp_digidisplay: boolean;
  mp_digiaudio: boolean;
  mp_digivideo: boolean;
  mp_bvod: boolean;
  mp_integration: boolean;
  mp_search: boolean;
  mp_socialmedia: boolean;
  mp_progdisplay: boolean;
  mp_progvideo: boolean;
  mp_progbvod: boolean;
  mp_progaudio: boolean;
  mp_progooh: boolean;
  mp_influencers: boolean;
};

export async function GET() {
  const res = await fetch(
    'https://xg4h-uyzs-dtex.a2.xano.io/api:RaUx9FOa/media_plan_versions'
  )
  if (!res.ok) return NextResponse.error()
  const data = await res.json()
  
  // Filter to keep only the highest version for each unique MBA number
  const filteredData = Object.values(
    (Array.isArray(data) ? data : [data]).reduce((acc: Record<string, any>, plan: any) => {
      const mbaNumber = plan.mba_number;
      if (!mbaNumber) {
        // Skip plans without an MBA number
        return acc;
      }
      // Use version_number field from media_plan_versions
      const versionNumber = plan.version_number || 0;
      if (!acc[mbaNumber] || (acc[mbaNumber].version_number || 0) < versionNumber) {
        acc[mbaNumber] = plan;
      }
      return acc;
    }, {} as Record<string, any>)
  );
  
  return NextResponse.json(filteredData)
}

