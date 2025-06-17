import { NextRequest, NextResponse } from 'next/server';
import { generateMBA, MBAData } from '@/lib/generateMBA';
import { format } from 'date-fns';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Basic validation
    if (!body.mbanumber || !body.mp_clientname) {
      return NextResponse.json({ error: 'Missing required MBA data' }, { status: 400 });
    }

    // Transform the incoming request body to fit the MBAData interface
    const dataForPdf: MBAData = {
      date: format(new Date(), 'dd/MM/yyyy'),
      mba_number: body.mbanumber,
      campaign_name: body.mp_campaignname,
      campaign_brand: body.mp_brand,
      po_number: body.mp_ponumber,
      media_plan_version: body.mp_plannumber,
      client: {
        name: body.mp_clientname,
        streetaddress: body.clientAddress,
        suburb: body.clientSuburb,
        state: body.clientState,
        postcode: body.clientPostcode,
      },
      campaign: {
        date_start: format(new Date(body.mp_campaigndates_start), 'dd/MM/yyyy'),
        date_end: format(new Date(body.mp_campaigndates_end), 'dd/MM/yyyy'),
      },
      gross_media: body.gross_media,
      totals: {
        gross_media: body.grossMediaTotal,
        service_fee: body.calculateAssembledFee,
        production: body.calculateProductionCosts,
        adserving: body.calculateAdServingFees,
        totals_ex_gst: body.totalInvestment,
        total_inc_gst: body.totalInvestment * 1.1, // Calculate GST
      },
      // Map the detailed billing months to the simpler structure needed for the MBA
      billingSchedule: body.billingMonths.map((m: { monthYear: string, totalAmount: string }) => ({
        monthYear: m.monthYear,
        totalAmount: m.totalAmount, 
      })),
    };

    // Generate the PDF buffer
    const pdfBuffer = await generateMBA(dataForPdf);

    // Return the PDF in the response
    const filename = `MBA_${body.mp_clientname}_${body.mp_campaignname}.pdf`;
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (error) {
    console.error('Error generating MBA PDF:', error);
    // It's good practice to check if error is an instance of Error
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to generate PDF', details: errorMessage }, { status: 500 });
  }
} 