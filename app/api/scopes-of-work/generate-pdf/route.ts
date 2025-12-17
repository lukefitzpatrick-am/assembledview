import { NextRequest, NextResponse } from "next/server"
import { generateScopeOfWork } from "@/lib/generateScopeOfWork"

// Helper function to sanitize filename by replacing Unicode characters with ASCII equivalents
function sanitizeFilename(name: string): string {
  return name
    // Replace smart quotes and other Unicode quotes
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // Smart double quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'") // Smart single quotes
    // Replace other common Unicode characters
    .replace(/[\u2013\u2014]/g, '-') // En/em dashes
    .replace(/\u2026/g, '...') // Ellipsis
    // Remove any remaining non-ASCII characters and keep only safe characters
    .replace(/[^\x20-\x7E]/g, '') // Remove any remaining non-ASCII
    // Replace spaces and other problematic characters with underscores
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    // Remove multiple consecutive underscores
    .replace(/_+/g, '_')
    // Remove leading/trailing underscores
    .replace(/^_+|_+$/g, '')
    // Limit length
    .substring(0, 100);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Basic validation
    if (!body.project_name || !body.client_name) {
      return NextResponse.json({ error: "Missing required scope data" }, { status: 400 });
    }

    // Generate the PDF buffer
    const pdfBuffer = await generateScopeOfWork(body);

    // Sanitize filenames to remove Unicode characters
    const sanitizedClientName = sanitizeFilename(body.client_name);
    const sanitizedProjectName = sanitizeFilename(body.project_name);
    const filename = `Scope_${sanitizedClientName}_${sanitizedProjectName}.pdf`;
    
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Error generating Scope PDF:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to generate PDF', details: errorMessage }, { status: 500 });
  }
}




