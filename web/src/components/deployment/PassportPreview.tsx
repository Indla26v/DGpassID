'use client';

import React, { useEffect, useRef, useState } from 'react';
import { QrCode } from 'lucide-react';
import { INSTRUCTION_COLUMNS, instructionRows, type InstructionEntry } from '@/core/domain/duty-instructions';
import {
  DEFAULT_SIGNATORY_DESIGNATION, PASSPORT_CONFERENCE, PASSPORT_LEAD, PASSPORT_TITLE, passportPeriodLine,
} from '@/core/domain/duty-passport';
import { POLICE_BANDOBUSHT_ZONES } from '@/core/domain/police-zones';
import type { InstructionTarget } from '@/core/domain/duty-instructions';

/** A4 at 96 dpi; the page is drawn at this size and scaled to the panel width. */
const PAPER_W = 794;
const PAPER_H = 1123;

export interface PassportPreviewValues {
  heading: string;
  closing: string;
  entries: InstructionEntry[];
  targets: InstructionTarget[];
  duty_from: string;
  duty_to: string;
  duty_hours: string;
  security_plan: string;
  place_of_duty: string;
  batch: string;
  back_title: string;
  back_points: string[];
  signatory: string;
}

const Placeholder = ({ children }: { children: React.ReactNode }) => <span className="italic text-slate-400">[{children}]</span>;

/** The duty passport as printed for each officer, with officer-specific values shown as placeholders. */
export function PassportPreview({ values, authority }: {
  values: PassportPreviewValues;
  authority: { name: string; signatureUrl: string | null } | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / PAPER_W)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const period = passportPeriodLine(values);
  const zones = [...new Set(values.targets.map(target => target.zone))];
  const zone = zones.length === 1 ? POLICE_BANDOBUSHT_ZONES.find(item => item.name === zones[0]) : undefined;
  const sectors = [...new Set(values.targets.filter(target => target.sector).map(target => target.sector as string))];
  const subSectors = values.targets.filter(target => target.subSector).map(target => target.subSector as string);
  const sector = zone && sectors.length === 1 ? zone.sectors.find(item => item.number === sectors[0]) : undefined;
  const signatoryLines = values.signatory.trim()
    ? values.signatory.split('\n').map(line => line.trim()).filter(Boolean)
    : [authority?.name || '', ...DEFAULT_SIGNATORY_DESIGNATION];
  const text = (value: string) => value.trim() || <span className="text-slate-400">-</span>;

  const fields: [string, React.ReactNode][] = [
    ['Name of the officer', <Placeholder key="n">Officer name</Placeholder>],
    ['Rank', <Placeholder key="r">Rank</Placeholder>],
    ['Gen Number', <Placeholder key="g">Gen Number</Placeholder>],
    ['Place of Duty', text(values.place_of_duty)],
    ['Component', zone ? `Zone ${zone.number}: ${zone.name}` : <Placeholder key="c">Officer&apos;s zone</Placeholder>],
    ['Sector Name', sector ? `${sector.number} - ${sector.name}` : <Placeholder key="s">Officer&apos;s sector</Placeholder>],
    ['Deployment Point', subSectors.length === 1 && sectors.length === 1
      ? <span key="d">{subSectors[0]} <Placeholder>- duty point</Placeholder></span>
      : <Placeholder key="d">Officer&apos;s sub-sector / duty point</Placeholder>],
    ['Batch', text(values.batch)],
  ];

  return (
    <div ref={frameRef} className="w-full space-y-2">
      {values.back_points.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Front</p>}
      <div className="relative overflow-hidden rounded-md bg-white shadow-md ring-1 ring-slate-200" style={{ height: PAPER_H * scale }}>
        <div aria-label="Duty passport preview" className="absolute left-0 top-0 origin-top-left bg-white px-[72px] pt-[44px] text-slate-900"
          style={{ width: PAPER_W, height: PAPER_H, transform: `scale(${scale})` }}>
          {/* Header */}
          <div className="relative h-[86px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ap-police-logo.png" alt="" className="absolute left-0 top-0 size-[76px] object-contain" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tirupati-district-police-crest.png" alt="" className="absolute right-0 top-0 h-[76px] object-contain" />
            <p className="pt-[6px] text-center font-serif text-[29px] font-bold tracking-[0.06em] text-[#b22222]">{PASSPORT_TITLE}</p>
            <p className="text-center font-sans text-[10.5px] font-bold tracking-[0.04em] text-slate-800">{PASSPORT_CONFERENCE}</p>
            <p className="mt-[2px] text-center font-sans text-[10.5px] font-bold text-slate-600">
              {period || <span className="italic text-rose-500">Set the duty dates and hours</span>}
            </p>
          </div>
          <div className="mt-[6px] border-t-[1.3px] border-black" />

          <p className="mt-[22px] font-serif text-[14.5px] font-bold">{PASSPORT_LEAD}</p>
          <table className="mt-[8px] w-full border-separate border-spacing-0 overflow-hidden rounded-[9px] border-[1.3px] border-slate-600 text-[12.5px]">
            <tbody>
              {fields.map(([label, value], index) => (
                <tr key={label}>
                  <th scope="row" className={`w-[174px] bg-[#f6f8fb] px-[13px] py-[8px] text-left align-middle font-serif text-[14px] font-bold text-slate-800 ${index ? 'border-t border-slate-300' : ''}`}>{label}</th>
                  <td colSpan={index < 4 ? 1 : 2} className={`border-l border-slate-300 px-[13px] py-[8px] align-middle font-sans ${index ? 'border-t' : ''}`}>{value}</td>
                  {index === 0 && (
                    <td rowSpan={4} className="w-[128px] border-l border-slate-300 align-middle">
                      <span className="mx-auto grid size-[100px] place-items-center rounded border border-dashed border-slate-300 text-slate-400">
                        <span className="text-center text-[10px] leading-tight"><QrCode aria-hidden="true" className="mx-auto mb-1 size-9" />ID card QR</span>
                      </span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {values.heading.trim() && <p className="mt-[24px] whitespace-pre-line font-serif text-[14.5px] font-bold">{values.heading.trim()}</p>}
          <table className="mt-[6px] w-full border-collapse font-sans text-[11.5px]">
            <thead>
              <tr className="bg-[#eef2f7] font-serif text-[13px] text-slate-800">
                {INSTRUCTION_COLUMNS.map((column, index) => (
                  <th key={column} scope="col" className={`border border-slate-400 px-[9px] py-[7px] font-bold ${index === 1 || index === 4 ? 'text-left' : 'text-center'}`}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instructionRows(values.entries).map(row => (
                <tr key={row[0]}>
                  <td className="w-[50px] border border-slate-400 px-[9px] py-[6px] text-center text-[#b22222]">{row[0]}</td>
                  <td className="w-[140px] border border-slate-400 px-[9px] py-[6px] font-bold">{row[1]}</td>
                  <td className="w-[98px] border border-slate-400 px-[9px] py-[6px] text-center">{row[2]}</td>
                  <td className="w-[80px] border border-slate-400 px-[9px] py-[6px] text-center">{row[3]}</td>
                  <td className="border border-slate-400 px-[9px] py-[6px]">{row[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {values.closing.trim() && <p className="mt-[22px] whitespace-pre-line font-serif text-[14.5px] font-bold leading-snug">{values.closing.trim()}</p>}

          {/* Footer */}
          <div className="mt-[26px] flex items-start justify-between gap-6">
            <dl className="grid grid-cols-[126px_auto] gap-y-[6px] text-[12px]">
              <dt className="font-serif text-[13px] font-bold">Sector Incharge</dt>
              <dd className="font-sans text-slate-600">: <Placeholder>Senior-most officer of the sector, phone</Placeholder></dd>
              <dt className="font-serif text-[13px] font-bold">Sub-sector Incharge</dt>
              <dd className="font-sans text-slate-600">: <Placeholder>Senior-most officer of the sub-sector, phone</Placeholder></dd>
              {['2nd', '3rd', '4th'].map(order => (
                <React.Fragment key={order}>
                  <dt className="font-serif text-[13px] font-bold"><Placeholder>{order} rank</Placeholder></dt>
                  <dd className="font-sans text-slate-600">: <Placeholder>First officer, phone</Placeholder></dd>
                </React.Fragment>
              ))}
            </dl>
            <div className="w-[250px] text-center font-serif">
              {authority?.signatureUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={authority.signatureUrl} alt="" className="mx-auto mb-[2px] h-[44px] object-contain" />
                : <div className="h-[20px]" />}
              {signatoryLines.map((line, index) => index === 0
                ? <p key={index} className="text-[14px] font-bold italic text-slate-800">{line || <Placeholder>SP name</Placeholder>}</p>
                : <p key={index} className="text-[12.5px]">{line}</p>)}
            </div>
          </div>
        </div>
      </div>
      {values.back_points.length > 0 && (
        <>
          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Back</p>
          <div className="relative overflow-hidden rounded-md bg-white shadow-md ring-1 ring-slate-200" style={{ height: PAPER_H * scale }}>
            <div aria-label="Duty passport back side preview" className="absolute left-0 top-0 origin-top-left bg-white px-[72px] pt-[44px] text-slate-900"
              style={{ width: PAPER_W, height: PAPER_H, transform: `scale(${scale})` }}>
              <div className="flex items-baseline justify-between gap-4 border-b-[1.3px] border-black pb-[8px] font-sans text-[10.5px] font-bold text-slate-600">
                <span className="tracking-[0.04em]">{PASSPORT_CONFERENCE}</span>
                <span className="italic text-slate-400">[Officer name · G.No.]</span>
              </div>
              <p className="mt-[30px] text-center font-serif text-[19px] font-bold text-slate-900">{values.back_title.trim() || 'Brief Instructions'}</p>
              <ol className="mt-[18px] space-y-[10px] font-sans text-[13px] leading-[1.45] text-slate-800">
                {values.back_points.map((point, index) => (
                  <li key={index} className="flex gap-[10px]">
                    <span className="w-[22px] shrink-0 text-right font-bold">{index + 1}.</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
