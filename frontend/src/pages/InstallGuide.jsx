import React, { useState, useEffect } from 'react';

function StepCard({ number, title, description, icon }) {
  return (
    <div className="flex gap-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="flex-shrink-0 w-10 h-10 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-lg">
        {number}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">{icon}</span>
          <h3 className="font-semibold text-gray-800">{title}</h3>
        </div>
        <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

export default function InstallGuide() {
  const [platform, setPlatform] = useState('unknown');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [swStatus, setSwStatus] = useState('checking');

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) setPlatform('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios');
    else setPlatform('desktop');

    // PWA 설치 여부 확인
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setInstalled(true);
    }

    // Android 설치 프롬프트 캡처
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // 서비스 워커 상태 확인
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        setSwStatus(reg ? 'active' : 'none');
      });
    } else {
      setSwStatus('unsupported');
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  const androidSteps = [
    {
      number: 1, icon: '🌐', title: 'Chrome으로 열기',
      description: '이 앱을 Chrome 브라우저로 접속하세요. Samsung Internet도 지원됩니다.',
    },
    {
      number: 2, icon: '⋮', title: '메뉴 버튼 탭',
      description: 'Chrome 우측 상단의 점 세 개(⋮) 버튼을 탭합니다.',
    },
    {
      number: 3, icon: '📲', title: '"홈 화면에 추가" 선택',
      description: '메뉴에서 "홈 화면에 추가" 또는 "앱 설치"를 탭합니다.',
    },
    {
      number: 4, icon: '✅', title: '설치 완료',
      description: '홈 화면에 조경 ERP 아이콘이 추가됩니다.',
    },
  ];

  const iosSteps = [
    {
      number: 1, icon: '🌐', title: 'Safari로 열기',
      description: 'iOS에서는 반드시 Safari 브라우저를 사용해야 합니다.',
    },
    {
      number: 2, icon: '⬆️', title: '공유 버튼 탭',
      description: '하단 가운데의 공유 버튼(화살표 위 네모)을 탭합니다.',
    },
    {
      number: 3, icon: '➕', title: '"홈 화면에 추가" 선택',
      description: '공유 메뉴를 아래로 스크롤하여 "홈 화면에 추가"를 탭합니다.',
    },
    {
      number: 4, icon: '✅', title: '추가 확인',
      description: '우측 상단 "추가"를 탭하면 홈 화면에 아이콘이 생깁니다.',
    },
  ];

  const desktopSteps = [
    {
      number: 1, icon: '🌐', title: 'Chrome으로 열기',
      description: 'Chrome 또는 Edge 브라우저로 접속하세요.',
    },
    {
      number: 2, icon: '📥', title: '주소창 설치 버튼',
      description: '주소창 오른쪽의 설치 아이콘(+)을 클릭합니다.',
    },
    {
      number: 3, icon: '✅', title: '설치 완료',
      description: '바탕화면 또는 시작메뉴에 앱이 추가됩니다.',
    },
  ];

  const steps = platform === 'ios' ? iosSteps : platform === 'android' ? androidSteps : desktopSteps;

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* 상태 배너 */}
      {installed ? (
        <div className="bg-green-600 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎉</span>
            <div>
              <h2 className="font-bold text-lg">이미 설치되어 있습니다!</h2>
              <p className="text-green-100 text-sm">홈 화면에서 조경 ERP를 바로 실행하세요.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
              🌿
            </div>
            <div>
              <h1 className="font-bold text-lg">조경 ERP 설치</h1>
              <p className="text-gray-400 text-sm">홈 화면에 추가하여 앱처럼 사용하세요</p>
            </div>
          </div>

          {/* Android 즉시 설치 버튼 */}
          {deferredPrompt && (
            <button
              onClick={handleInstallClick}
              className="w-full mt-2 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl transition-colors"
            >
              📲 지금 설치하기
            </button>
          )}
        </div>
      )}

      {/* 플랫폼 안내 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <div className="flex gap-2 mb-1">
          {['android', 'ios', 'desktop'].map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                platform === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p === 'android' ? '🤖 안드로이드' : p === 'ios' ? '🍎 아이폰' : '💻 PC'}
            </button>
          ))}
        </div>
      </div>

      {/* 설치 단계 */}
      <div className="space-y-3">
        {steps.map((step) => (
          <StepCard key={step.number} {...step} />
        ))}
      </div>

      {/* 카카오톡 공유 기능 안내 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
        <h2 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="text-xl">💬</span>
          카카오톡 공유 연동
        </h2>
        <p className="text-sm text-gray-600 mb-3 leading-relaxed">
          앱 설치 후 카카오톡에서 현장 메시지를 조경 ERP로 바로 공유할 수 있습니다.
          AI가 자동으로 파싱하여 일지를 생성합니다.
        </p>
        <div className="space-y-2">
          {[
            { icon: '1️⃣', text: '카카오톡 현장 채팅방에서 메시지 선택' },
            { icon: '2️⃣', text: '공유하기 → 조경 ERP 선택' },
            { icon: '3️⃣', text: 'AI가 자동으로 일지 생성 및 저장' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-gray-700">
              <span>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 p-3 bg-yellow-100 rounded-xl">
          <p className="text-xs text-yellow-800">
            ⚠️ 카카오톡 공유는 앱을 <strong>홈 화면에 설치</strong>한 후에만 목록에 나타납니다.
          </p>
        </div>
      </div>

      {/* 서비스 워커 상태 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
        <h3 className="font-semibold text-gray-700 mb-2 text-sm">시스템 상태</h3>
        <div className="space-y-2">
          <StatusRow
            label="오프라인 지원"
            status={swStatus === 'active' ? 'ok' : swStatus === 'none' ? 'warn' : 'error'}
            text={swStatus === 'active' ? '활성화됨' : swStatus === 'none' ? '대기 중' : '미지원'}
          />
          <StatusRow
            label="PWA 설치"
            status={installed ? 'ok' : 'warn'}
            text={installed ? '설치됨' : '미설치'}
          />
          <StatusRow
            label="카카오 공유 수신"
            status={installed ? 'ok' : 'warn'}
            text={installed ? '사용 가능' : '앱 설치 필요'}
          />
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, status, text }) {
  const colors = { ok: 'text-green-600 bg-green-50', warn: 'text-yellow-600 bg-yellow-50', error: 'text-red-600 bg-red-50' };
  const icons = { ok: '✅', warn: '⚠️', error: '❌' };
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status]}`}>
        {icons[status]} {text}
      </span>
    </div>
  );
}
