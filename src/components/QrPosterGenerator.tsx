import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { HeartHandshake, ShieldCheck, Printer, Sparkles, MapPin } from 'lucide-react';

interface QrPosterGeneratorProps {
  schoolName: string;
  accessCode: string;
  spaces?: string[];
}

export const QrPosterGenerator: React.FC<QrPosterGeneratorProps> = ({
  schoolName,
  accessCode,
  spaces = [],
}) => {
  const [appUrl, setAppUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : 'https://te-escucho.edu'
  );
  const [selectedSpace, setSelectedSpace] = useState('');

  const cleanBase = (appUrl || 'https://te-escucho.edu').replace(/\/+$/, '');
  const qrLink = selectedSpace
    ? `${cleanBase}/?school=${encodeURIComponent(accessCode)}&space=${encodeURIComponent(selectedSpace)}`
    : `${cleanBase}/?school=${encodeURIComponent(accessCode)}`;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Controls bar hidden during printing */}
      <div className="print:hidden bg-white p-5 rounded-2xl border border-slate-200 flex flex-wrap items-end justify-between gap-4">
        <div className="flex-1 min-w-[240px]">
          <label
            htmlFor="poster-url"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Enlace base de la aplicación
          </label>
          <input
            id="poster-url"
            type="text"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>

        {spaces.length > 0 && (
          <div className="min-w-[200px]">
            <label
              htmlFor="poster-space"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Zona del afiche (pre-marca espacio)
            </label>
            <select
              id="poster-space"
              value={selectedSpace}
              onChange={(e) => setSelectedSpace(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-800"
            >
              <option value="">General del colegio</option>
              {spaces.map((sp) => (
                <option key={sp} value={sp}>
                  {sp}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 bg-teal-700 hover:bg-teal-800 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition whitespace-nowrap shrink-0 min-h-[42px]"
        >
          <Printer className="w-4 h-4" />
          Imprimir Afiche A4
        </button>
      </div>

      {/* Placement advice hidden on print */}
      <div className="print:hidden bg-sky-50/70 border border-sky-200 rounded-2xl p-4 flex items-start gap-3">
        <MapPin className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-700 leading-relaxed">
          <strong className="text-slate-900">Enlace QR generado:</strong>{' '}
          <span className="font-mono text-teal-900 break-all">{qrLink}</span>
          {' — '}coloca estos afiches en lugares privados (puertas de baños, biblioteca, tópico y oficinas de tutoría).
        </p>
      </div>

      {/* Printable A4 Poster */}
      <div className="bg-gradient-to-b from-sky-50 via-white to-emerald-50 border-2 border-teal-700 rounded-3xl p-8 sm:p-10 text-center max-w-[660px] mx-auto print:border-2 print:shadow-none print:w-full print:rounded-2xl">
        <p className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800 mb-5">
          <ShieldCheck className="w-4 h-4 text-emerald-700" />
          100% Anónimo · Confidencial · Sin registro
        </p>

        <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <HeartHandshake className="w-9 h-9 text-teal-700" />
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight text-balance">
          ¿Sientes que te excluyen, te molestan o necesitas hablar?
        </h1>

        <p className="text-base text-slate-600 mt-3.5 max-w-md mx-auto leading-relaxed">
          No tienes que pasarlo en silencio. En{' '}
          <strong className="text-teal-800">Te Escucho</strong> puedes conversar con el equipo de psicología sin dar tu nombre ni tu correo.
        </p>

        {/* QR Block */}
        <div className="my-7 inline-block bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <QRCodeSVG
            value={qrLink}
            size={192}
            bgColor="#ffffff"
            fgColor="#0f172a"
            level="H"
          />
          <p className="text-xs font-semibold text-slate-600 mt-3">
            Escanea con la cámara de tu celular
          </p>
        </div>

        {/* School Access Code */}
        <div className="bg-teal-800 text-white rounded-2xl p-5 max-w-sm mx-auto">
          <span className="text-xs text-teal-100 block">
            Código de acceso de {schoolName}
            {selectedSpace ? ` · Zona: ${selectedSpace}` : ''}
          </span>
          <span className="font-mono text-2xl sm:text-3xl font-bold tracking-widest mt-1 block">
            {accessCode}
          </span>
        </div>

        {/* 3 Quick Steps */}
        <div className="grid grid-cols-3 gap-4 mt-8 pt-6 border-t border-slate-200 text-xs text-slate-600 text-left sm:text-center">
          <div>
            <strong className="block text-teal-800 text-sm mb-1">1. Escanea</strong>
            Entra desde el navegador sin instalar nada.
          </div>
          <div>
            <strong className="block text-teal-800 text-sm mb-1">2. Crea tu PIN</strong>
            Guarda tu código único y clave de 4 dígitos.
          </div>
          <div>
            <strong className="block text-teal-800 text-sm mb-1">3. Desahógate</strong>
            Recibe orientación real de tus psicólogos.
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-500 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-teal-700" />
          Programa de Bienestar y Convivencia Escolar · {schoolName}
        </p>
      </div>
    </div>
  );
};
