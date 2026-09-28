import ExcelJS from 'exceljs';

export interface ActionItemExportRow {
  done: boolean;
  action: string;
  owner: string;
  due: string;
  assignedBy: string;
  sourceMeeting: string;
}

export async function generateExcelReport(
  meetingTitle: string,
  items: ActionItemExportRow[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Meeting Action Items App';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Action Items');

  worksheet.columns = [
    { header: 'Done', key: 'done', width: 10 },
    { header: 'Action', key: 'action', width: 45 },
    { header: 'Owner', key: 'owner', width: 20 },
    { header: 'Due', key: 'due', width: 18 },
    { header: 'Assigned By', key: 'assignedBy', width: 20 },
    { header: 'Source Meeting', key: 'sourceMeeting', width: 30 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate dark
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  // Add data rows
  items.forEach((item, index) => {
    const rowNumber = index + 2;
    const row = worksheet.addRow({
      done: item.done ? '☑' : '☐',
      action: item.action,
      owner: item.owner,
      due: item.due || '-',
      assignedBy: item.assignedBy || 'Unassigned',
      sourceMeeting: item.sourceMeeting || meetingTitle,
    });

    row.height = 22;
    row.alignment = { vertical: 'middle' };

    // Data validation for Done column: dropdown with ☐ and ☑
    row.getCell('done').dataValidation = {
      type: 'list',
      allowBlank: false,
      formulae: ['"☐,☑"'],
    };
    row.getCell('done').alignment = { horizontal: 'center', vertical: 'middle' };

    // Set initial strikethrough if already done
    if (item.done) {
      row.font = { strike: true, color: { argb: 'FF94A3B8' } };
    }
  });

  // Conditional formatting: strike through completed rows when Done is ☑
  worksheet.addConditionalFormatting({
    ref: `A2:F${Math.max(items.length + 1, 2)}`,
    rules: [
      {
        type: 'expression',
        formulae: ['$A2="☑"'],
        priority: 1,
        style: {
          font: { strike: true, color: { argb: 'FF94A3B8' } },
        },
      },
    ],
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
