'use client';

import React from 'react';
import { INSTRUCTION_COLUMNS, instructionRows, type InstructionEntry } from '@/core/domain/duty-instructions';

/** The duty instruction as zone logins see it: heading line, S.No / entities / date / time / place table, closing line. */
export function InstructionTable({ heading, closing, entries, compact = false }: { heading: string; closing: string; entries: InstructionEntry[]; compact?: boolean }) {
  const lead = compact ? 'text-sm font-bold' : 'text-base font-bold sm:text-lg';
  const cell = compact ? 'px-1.5 py-1.5' : 'px-3 py-2';
  return (
    <div className="space-y-3 font-serif text-[#1f4970]">
      {heading && <p className={`whitespace-pre-line ${lead}`}>{heading}</p>}
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse border border-[#1f4970] ${compact ? 'text-xs' : 'min-w-[560px] text-sm'}`}>
          <thead>
            <tr>
              {INSTRUCTION_COLUMNS.map(column => (
                <th key={column} scope="col" className={`border border-[#1f4970] ${cell} text-center font-bold`}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody className="text-slate-900">
            {instructionRows(entries).map(row => (
              <tr key={row[0]}>
                <td className={`border border-[#1f4970] ${cell} text-center`}>{row[0]}</td>
                <td className={`border border-[#1f4970] ${cell}`}>{row[1]}</td>
                <td className={`border border-[#1f4970] ${cell} text-center tabular-nums`}>{row[2]}</td>
                <td className={`border border-[#1f4970] ${cell} text-center tabular-nums`}>{row[3]}</td>
                <td className={`border border-[#1f4970] ${cell}`}>{row[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {closing && <p className={`whitespace-pre-line ${lead}`}>{closing}</p>}
    </div>
  );
}
