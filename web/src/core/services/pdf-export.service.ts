import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { IPdfExportService, PdfExportOptions } from '../interfaces/pdf-export-service.interface';
import { PassEntity } from '../domain/entities/pass.entity';
import { OFFICES } from '../domain/offices';
import { getPassValidFrom, PASS_VALID_TO } from '../domain/pass-validity';

export class PdfExportService implements IPdfExportService {
  private formatDate(val: unknown): string {
    if (!val) return '—';
    if (val instanceof Date) {
      const year = val.getFullYear();
      const month = String(val.getMonth() + 1).padStart(2, '0');
      const day = String(val.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    const str = String(val).trim();
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return str || '—';
  }

  public generatePdf(passes: PassEntity[], options: PdfExportOptions = {}): Uint8Array {
    // A4 Landscape: 297mm x 210mm
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const title = options.title || '61st ALL INDIA DGsP / IGPs CONFERENCE – 2026';
    const subtitle = options.subtitle || 'OFFICIAL DUTY ACCESS PASS LIST · IISER TIRUPATI';

    const now = new Date();
    const timestampStr = `${now.toISOString().slice(0, 10)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} IST`;

    const metaParts = [
      `Total Passes: ${passes.length}`,
      options.officeName ? `Jurisdiction: ${options.officeName}` : null,
      options.department ? `Department: ${options.department}` : null,
      options.statusFilter && options.statusFilter !== 'ALL' ? `Status: ${options.statusFilter}` : null,
      `Generated: ${timestampStr}`,
    ].filter(Boolean).join('   |   ');

    // Header drawing function for every page
    const drawHeader = () => {
      // Top navy bar accent
      doc.setFillColor(11, 37, 69); // #0B2545
      doc.rect(0, 0, pageWidth, 4, 'F');

      // Top crimson accent line
      doc.setFillColor(139, 26, 26); // #8B1A1A
      doc.rect(0, 4, pageWidth, 1.2, 'F');

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(11, 37, 69);
      doc.text(title, 14, 11);

      // Subtitle
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(139, 26, 26);
      doc.text(subtitle, 14, 15.5);

      // Meta info bar
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(metaParts, 14, 19.5);

      // Dividing thin rule
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.4);
      doc.line(14, 21.5, pageWidth - 14, 21.5);
    };

    // Table Columns definition
    const tableHeaders = [
      '#',
      'Pass No',
      'Cardholder Name',
      'Father / Spouse',
      'Subdivision',
      'Department',
      'Designation / Trade',
      'Mobile',
      'Govt ID',
      'Status',
      'Valid Period',
    ];

    const tableRows = passes.map((p, idx) => {
      const officeName =
        OFFICES.find((o) => o.id === p.office_id)?.name ??
        (p.office_id ? p.office_id : 'Unassigned');

      const govtId = p.govt_id_number
        ? `${p.govt_id_type || 'ID'}: ${p.govt_id_number}`
        : '—';

      const validFrom = getPassValidFrom(p);
      const validPeriod = `${validFrom ? this.formatDate(validFrom) : 'On print'} to ${this.formatDate(PASS_VALID_TO)}`;

      return [
        String(idx + 1),
        p.pass_number || '—',
        p.full_name || '—',
        p.father_or_spouse_name || '—',
        officeName,
        p.department || '—',
        p.designation_or_trade || '—',
        p.mobile_number || '—',
        govtId,
        p.status || '—',
        validPeriod,
      ];
    });

    autoTable(doc, {
      head: [tableHeaders],
      body: tableRows,
      startY: 25,
      margin: { top: 25, left: 12, right: 12, bottom: 14 },
      theme: 'grid',
      styles: {
        font: 'helvetica',
        fontSize: 7,
        cellPadding: 1.6,
        overflow: 'linebreak',
        textColor: [30, 41, 59], // #1e293b
        lineColor: [226, 232, 240], // #e2e8f0
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [11, 37, 69], // #0B2545
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        halign: 'left',
        cellPadding: 2,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // #f8fafc
      },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },  // #
        1: { cellWidth: 22, fontStyle: 'bold' }, // Pass No
        2: { cellWidth: 35 },                   // Name
        3: { cellWidth: 28 },                   // Father/Spouse
        4: { cellWidth: 28 },                   // Subdivision
        5: { cellWidth: 35 },                   // Department
        6: { cellWidth: 26 },                   // Designation
        7: { cellWidth: 23 },                   // Mobile
        8: { cellWidth: 32 },                   // Govt ID
        9: { cellWidth: 18, halign: 'center' }, // Status
        10: { cellWidth: 18, halign: 'center' }, // Validity
      },
      didDrawPage: () => {
        drawHeader();
      },
    });

    // Draw footer on every page with exact total page count
    const totalPages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(148, 163, 184); // #94a3b8

      doc.text(
        'CONFIDENTIAL · OFFICIAL ANDHRA PRADESH POLICE SECURITY REGISTRY · NOT FOR PUBLIC CIRCULATION',
        14,
        pageHeight - 6
      );

      const pageStr = `Page ${i} of ${totalPages}`;
      doc.text(pageStr, pageWidth - 14 - doc.getTextWidth(pageStr), pageHeight - 6);
    }

    const arrayBuffer = doc.output('arraybuffer');
    return new Uint8Array(arrayBuffer);
  }
}
