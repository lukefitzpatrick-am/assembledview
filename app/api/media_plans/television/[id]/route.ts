import { NextRequest, NextResponse } from 'next/server';
import { xanoUrl, xanoPostHeaderRecord, xanoAuthHeaderRecord } from '@/lib/api/xano';
import { requireRole } from '@/lib/requireRole';

/**
 * SEC-G / SEC-10: dedicated channel [id] mutate paths match the staff-gated
 * media_plans/[...path] catch-all. Verified: no client-role call site writes
 * channel line items (create/edit save → replaceChannelLineItems → catch-all;
 * createTelevisionLineItem/update/delete helpers are dead exports).
 */

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = params;
    const data = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${xanoUrl("television_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}/${id}`,
      {
      method: 'PUT',
      headers: {
        ...xanoPostHeaderRecord(),
      },
      body: JSON.stringify(data),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to update television data");
    }

    const result = await response.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating television data:", error);
    
    let errorMessage = "Failed to update television data";
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const gate = await requireRole(request, ["admin"])
    if ("response" in gate) return gate.response

    const { id } = params;
    
    if (!id) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${xanoUrl("television_line_items", ["XANO_MEDIA_PLANS_BASE_URL", "XANO_MEDIAPLANS_BASE_URL"])}/${id}`,
      {
      method: 'DELETE',
      headers: {
        ...xanoAuthHeaderRecord(),
      },
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to delete television data");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting television data:", error);
    
    let errorMessage = "Failed to delete television data";
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
