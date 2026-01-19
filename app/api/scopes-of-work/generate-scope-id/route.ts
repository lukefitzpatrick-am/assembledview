import { NextResponse } from "next/server"
import axios from "axios"
import { xanoUrl } from "@/lib/api/xano"

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const mbaIdentifier = body.mbaIdentifier;

    if (!mbaIdentifier) {
      return NextResponse.json({ error: "MBA Identifier is required" }, { status: 400 });
    }

    // Fetch all existing scopes
    const response = await axios.get(xanoUrl("scope_of_work", "XANO_SCOPES_BASE_URL"));

    const allScopes = Array.isArray(response.data) ? response.data : [];
    
    // Filter scopes for this client
    const existingScopes = allScopes.filter(
      (scope: any) => scope.client_name === body.clientName
    );

    // Find the highest scope number for this client
    // Check project_name for scope ID pattern (since schema doesn't have dedicated scope_id field)
    let maxNumber = 0;
    const scopeIdPrefix = `${mbaIdentifier}_sow`;
    
    for (const scope of existingScopes) {
      // Check if project_name contains the scope ID pattern
      if (scope.project_name) {
        const match = scope.project_name.match(new RegExp(`${scopeIdPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)`));
        if (match) {
          const numberPart = parseInt(match[1], 10);
          if (!isNaN(numberPart) && numberPart > maxNumber) {
            maxNumber = numberPart;
          }
        }
      }
    }

    // If no existing scopes found, check if we can query by a different method
    // For now, we'll increment from maxNumber found
    const newNumber = maxNumber + 1;
    const scopeId = `${scopeIdPrefix}${newNumber.toString().padStart(3, "0")}`;

    return NextResponse.json({ scopeId });
  } catch (error) {
    console.error("Failed to generate scope ID:", error);
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message;
      return NextResponse.json({ error: errorMessage }, { status: error.response?.status || 500 });
    }
    return NextResponse.json({ error: "Failed to generate scope ID" }, { status: 500 });
  }
}

