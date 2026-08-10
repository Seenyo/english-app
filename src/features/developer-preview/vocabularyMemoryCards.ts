import type { VocabularyMemoryCard } from '@shared/vocabulary/contracts';

// QA済みの実データだけを使用する。汎用ダミー例文へはフォールバックしない。
export const developerPreviewMemoryCards = [
  {
    id: 206,
    kind: 'word',
    sourceOrder: 206,
    term: 'maintain',
    meaningJa: 'を維持する；と主張する；を養う',
    section: 3,
    part: 1,
    examples: [
      {
        english:
          'Regular exercise helps maintain a healthy weight and strong bones.',
        japanese: '定期的な運動は健康的な体重と強い骨の維持に役立つ。',
      },
      {
        english:
          'The defendant maintains that he was at home during the incident.',
        japanese: '被告は事件当時家にいたと主張している。',
      },
      {
        english: 'He works two jobs to maintain his family of five.',
        japanese: '彼は5人家族を養うために2つの仕事をしている。',
      },
    ],
  },
  {
    id: 723,
    kind: 'word',
    sourceOrder: 723,
    term: 'attribute',
    meaningJa: '（結果など）を（～に）帰する（to）',
    section: 8,
    part: 1,
    examples: [
      {
        english:
          "The coach attributed the team's victory to rigorous training.",
        japanese: 'コーチはチームの勝利を厳しい練習に帰した。',
      },
      {
        english:
          'She attributes her success to years of hard work and patience.',
        japanese: '彼女は自身の成功を長年の努力と忍耐に帰している。',
      },
      {
        english:
          'The decline in sales was attributed to the economic downturn.',
        japanese: '売上の減少は景気後退に帰された。',
      },
    ],
  },
  {
    id: 792,
    kind: 'word',
    sourceOrder: 792,
    term: 'reluctant',
    meaningJa: '気が進まない，嫌がる（⇔ willing ⇒ 298）',
    section: 8,
    part: 1,
    examples: [
      {
        english: 'He was reluctant to share his password with colleagues.',
        japanese: '彼は同僚にパスワードを共有するのを嫌がった。',
      },
      {
        english: 'The company was reluctant to invest in unproven technology.',
        japanese: 'その会社は実証されていない技術に投資する気が進まなかった。',
      },
      {
        english: 'She felt reluctant about moving away from her hometown.',
        japanese: '彼女は故郷を離れることに気が進まなかった。',
      },
    ],
  },
  {
    id: 788,
    kind: 'word',
    sourceOrder: 788,
    term: 'subtle',
    meaningJa: '微妙な；（気体などが）希薄な',
    section: 8,
    part: 1,
    examples: [
      {
        english: 'The chef added a subtle hint of cinnamon to the dessert.',
        japanese: 'シェフはデザートにシナモンの微妙な風味を加えた。',
      },
      {
        english:
          'There was a subtle difference between the two paintings that few noticed.',
        japanese:
          '2つの絵画の間にはほとんどの人が気づかない微妙な違いがあった。',
      },
      {
        english: 'The subtle fragrance of jasmine filled the evening air.',
        japanese: 'ジャスミンのほのかな香りが夕暮れの空気に漂っていた。',
      },
    ],
  },
  {
    id: 80,
    kind: 'word',
    sourceOrder: 80,
    term: 'likely',
    meaningJa: 'ありそうな（⇔ unlikely ありそうもない）',
    section: 1,
    part: 1,
    examples: [
      {
        english: 'Rain is likely tomorrow afternoon according to the forecast.',
        japanese: '予報によると明日の午後は雨が降る可能性が高い。',
      },
      {
        english: 'She is the most likely candidate to get the promotion.',
        japanese: '彼女は昇進する最も可能性の高い候補者である。',
      },
      {
        english: 'A delay is likely due to the heavy snowfall.',
        japanese: '大雪のため遅延が起こりそうだ。',
      },
    ],
  },
  {
    id: 1304,
    kind: 'word',
    sourceOrder: 1304,
    term: 'compel',
    meaningJa: 'に強いる',
    section: 14,
    part: 2,
    examples: [
      {
        english:
          'The court compelled the company to release the internal documents.',
        japanese: '裁判所はその会社に内部文書の公開を強いた。',
      },
      {
        english: "Hunger compelled him to accept a job he didn't really want.",
        japanese: '空腹が彼に本当は望まない仕事を受けざるを得なくさせた。',
      },
      {
        english:
          'The new regulation compels manufacturers to label all artificial ingredients.',
        japanese: '新しい規制は製造業者にすべての人工成分の表示を強いている。',
      },
    ],
  },
  {
    id: 1684,
    kind: 'word',
    sourceOrder: 1684,
    term: 'coherent',
    meaningJa: '一貫した，筋の通った；結束した',
    section: 17,
    part: 3,
    examples: [
      {
        english:
          'She presented a coherent argument that convinced the entire board.',
        japanese: '彼女は理事会全体を納得させる筋の通った主張を提示した。',
      },
      {
        english:
          'The team remained coherent despite months of internal conflict.',
        japanese: 'そのチームは数か月の内部対立にもかかわらず結束していた。',
      },
      {
        english:
          'His essay lacked a coherent structure, jumping between unrelated topics.',
        japanese:
          '彼の論文は一貫した構造を欠き、無関係な話題の間を行き来していた。',
      },
    ],
  },
  {
    id: 101,
    kind: 'word',
    sourceOrder: 101,
    term: 'notice',
    meaningJa: 'に気づく',
    section: 2,
    part: 1,
    examples: [
      {
        english: "I didn't notice the scratch on my car until yesterday.",
        japanese: '昨日まで車のひっかき傷に気づかなかった。',
      },
      {
        english:
          'She noticed that the front door was slightly open when she returned home.',
        japanese:
          '彼女は帰宅したとき、玄関のドアが少し開いていることに気づいた。',
      },
      {
        english:
          'The teacher noticed a significant improvement in his handwriting this semester.',
        japanese: '先生は今学期、彼の字が著しく上達したことに気づいた。',
      },
    ],
  },
  {
    id: 534,
    kind: 'word',
    sourceOrder: 534,
    term: 'recover',
    meaningJa: '回復する；を取り戻す',
    section: 6,
    part: 1,
    examples: [
      {
        english:
          'The stock market recovered quickly after the surprise election results.',
        japanese: '驚きの選挙結果の後、株式市場は急速に回復した。',
      },
      {
        english:
          'The police recovered the stolen painting from a warehouse in Berlin.',
        japanese: '警察はベルリンの倉庫から盗まれた絵画を取り戻した。',
      },
      {
        english: 'It took him three months to recover from the knee surgery.',
        japanese: '膝の手術から回復するのに三か月かかった。',
      },
    ],
  },
  {
    id: 882,
    kind: 'word',
    sourceOrder: 882,
    term: 'optimistic',
    meaningJa: '楽観的な（⇔ pessimistic ⇒ 1593）',
    section: 9,
    part: 2,
    examples: [
      {
        english:
          "The investors remain optimistic about the company's future growth.",
        japanese:
          '投資家たちはその会社の将来の成長について楽観的な見方を保っている。',
      },
      {
        english: 'She is optimistic that the negotiations will succeed.',
        japanese: '彼女は交渉が成功すると楽観的に考えている。',
      },
      {
        english: 'An optimistic outlook can improve your overall well-being.',
        japanese: '楽観的な見方は全体的な幸福感を高めることができる。',
      },
    ],
  },
  {
    id: 2004,
    kind: 'idiom',
    sourceOrder: 4,
    term: '(at) first hand',
    meaningJa: '直接に、じかに',
    section: 1,
    part: null,
    examples: [
      {
        english:
          'She wanted to see the damage at first hand before filing the insurance claim.',
        japanese: '彼女は保険金請求を提出する前に、被害を直接確認したかった。',
      },
      {
        english:
          'Journalists arrived at the scene to report the events at first hand.',
        japanese: '記者たちは出来事を直接取材するため、現場に到着した。',
      },
      {
        english:
          'You can only appreciate the sculpture by viewing it at first hand.',
        japanese: 'その彫刻の素晴らしさは、直接見て初めて理解できる。',
      },
    ],
  },
  {
    id: 2052,
    kind: 'idiom',
    sourceOrder: 52,
    term: 'account for ～',
    meaningJa: '①～の説明となる、～の理由を説明する ②（割合など）を占める',
    section: 1,
    part: null,
    examples: [
      {
        english:
          'How do you account for the missing funds in the budget report?',
        japanese:
          '予算報告の行方不明の資金についてどのように説明するのですか。',
      },
      {
        english:
          "Renewable energy accounts for thirty percent of the country's electricity.",
        japanese: '再生可能エネルギーは国の電力の30パーセントを占めている。',
      },
      {
        english: 'Heavy traffic accounted for his late arrival at the meeting.',
        japanese: 'ひどい交通渋滞が会議への彼の遅刻の理由であった。',
      },
    ],
  },
  {
    id: 2193,
    kind: 'idiom',
    sourceOrder: 193,
    term: 'be aware of ～',
    meaningJa: '～を知っている、～に気づいている',
    section: 2,
    part: null,
    examples: [
      {
        english: 'Are you aware of the new rules starting next week?',
        japanese: '来週から始まる新しいルールを知っていますか？',
      },
      {
        english: 'He was not aware of the dog hiding under the table.',
        japanese: '彼はテーブルの下に隠れている犬に気づいていなかった。',
      },
      {
        english: 'The manager is fully aware of the issues in the system.',
        japanese: 'マネージャーはシステムの問題点を完全に知っている。',
      },
    ],
  },
  {
    id: 2407,
    kind: 'idiom',
    sourceOrder: 407,
    term: 'carry out ～',
    meaningJa: '～を実行する ～を果たす',
    section: 5,
    part: null,
    examples: [
      {
        english:
          'The researchers carried out the experiment over three months.',
        japanese: '研究者たちは3か月にわたって実験を実行した。',
      },
      {
        english:
          'The city council carried out its promise to build a new park.',
        japanese: '市議会は新しい公園を建設するという約束を果たした。',
      },
      {
        english:
          'She carried out the instructions exactly as written in the manual.',
        japanese: '彼女はマニュアルに書かれている通りに指示を実行した。',
      },
    ],
  },
  {
    id: 2455,
    kind: 'idiom',
    sourceOrder: 455,
    term: 'come up with',
    meaningJa: '～を思いつく',
    section: 5,
    part: null,
    examples: [
      {
        english:
          'The team came up with a creative solution to the scheduling problem.',
        japanese:
          'チームはスケジュール問題に対する独創的な解決策を思いついた。',
      },
      {
        english: 'She came up with three different designs for the new logo.',
        japanese: '彼女は新しいロゴのために3つの異なるデザインを思いついた。',
      },
      {
        english: 'Can you come up with a better name for the campaign?',
        japanese: 'キャンペーンのもっと良い名前を思いつけますか？',
      },
    ],
  },
  {
    id: 2510,
    kind: 'idiom',
    sourceOrder: 510,
    term: 'do away with ～',
    meaningJa: '～を取り除く、～を廃止する = eliminate, abolish',
    section: 6,
    part: null,
    examples: [
      {
        english: 'The school did away with uniforms last year.',
        japanese: 'その学校は昨年制服を廃止した。',
      },
      {
        english: 'We should do away with outdated regulations.',
        japanese: '私たちは時代遅れの規制を取り除くべきだ。',
      },
      {
        english: 'The new manager did away with the old filing system.',
        japanese: '新しい管理者は古いファイリングシステムを廃止した。',
      },
    ],
  },
  {
    id: 2865,
    kind: 'idiom',
    sourceOrder: 865,
    term: 'in terms of ～',
    meaningJa: '～の観点から、～に換算して',
    section: 9,
    part: null,
    examples: [
      {
        english:
          'The new phone is superior in terms of battery life but lacks a good camera.',
        japanese:
          '新しいスマートフォンはバッテリー寿命の観点からは優れているが、良いカメラを搭載していない。',
      },
      {
        english:
          'In terms of cost per unit, the new manufacturing process is far more efficient.',
        japanese:
          '一個あたりのコストに換算すると、新しい製造工程ははるかに効率的だ。',
      },
      {
        english:
          'The two candidates differ greatly in terms of their approach to healthcare reform.',
        japanese:
          '二人の候補者は医療改革へのアプローチの観点から大きく異なる。',
      },
    ],
  },
  {
    id: 3272,
    kind: 'idiom',
    sourceOrder: 1272,
    term: 'put off ～',
    meaningJa: '～を延期する = postpone',
    section: 13,
    part: null,
    examples: [
      {
        english: 'We had to put off the meeting because the client was sick.',
        japanese: '顧客が病気になったため、会議を延期しなければならなかった。',
      },
      {
        english: 'She keeps putting off going to the dentist due to her fear.',
        japanese: '彼女は恐怖から、歯医者に行くのを延期し続けている。',
      },
      {
        english: 'The concert was put off until next week due to heavy rain.',
        japanese: '豪雨のため、コンサートは来週まで延期された。',
      },
    ],
  },
  {
    id: 3487,
    kind: 'idiom',
    sourceOrder: 1487,
    term: 'take over ～',
    meaningJa: '（～を）引き継ぐ、～を支配する',
    section: 15,
    part: null,
    examples: [
      {
        english:
          'She will take over the department when the current manager retires.',
        japanese:
          '現在のマネージャーが退職したら、彼女が部署を引き継ぐことになっている。',
      },
      {
        english: 'The army threatened to take over the government by force.',
        japanese: '軍は武力で政府を支配すると脅した。',
      },
      {
        english: "I need someone to take over my duties while I'm on leave.",
        japanese: '休暇中は誰かに私の業務を引き継いでもらう必要がある。',
      },
    ],
  },
  {
    id: 2101,
    kind: 'idiom',
    sourceOrder: 101,
    term: 'as 〔so〕 long as ...',
    meaningJa: '...する限り ...でさえあれば',
    section: 2,
    part: null,
    examples: [
      {
        english:
          "As long as it doesn't rain, we'll have the picnic in the park.",
        japanese: '雨が降らない限り、公園でピクニックをするつもりだ。',
      },
      {
        english: 'You can borrow my laptop as long as you return it by Friday.',
        japanese:
          '金曜日までに返してくれる限り、ノートパソコンを貸してあげるよ。',
      },
      {
        english:
          'As long as the deadline is met, the format is entirely up to you.',
        japanese: '期限を守る限り、形式は完全に任せます。',
      },
    ],
  },
] satisfies VocabularyMemoryCard[];
