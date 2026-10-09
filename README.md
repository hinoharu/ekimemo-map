# 駅レーダー圏マップ

駅メモのレーダー（現在地から近い順に k 駅）をシミュレートし、ある駅が **レーダー k 位以内に入る地域** を地図上に描くページです。

- 公開ページ：`https://<ユーザー名>.github.io/<リポジトリ名>/`
- 仕組みと開発方法：[CLAUDE.md](CLAUDE.md)

## できること
- 駅を検索または地図上でタップして、その駅が k 位以内に入る地域を表示する
- 距離の測り方を切り替える：緯度経度の平面（既定）／cos 補正の平面／球面
- 1〜k 位の境界を重ねて表示する。表示中の全駅の境界（k 次ボロノイ図）を描く
- 地図上の任意の地点で、レーダーの順位を確認する
- 現在地への追従と、最寄り駅の変化・レーダーの顔ぶれの変化・選んだ駅の圏内への出入りを通知する

## 開発
```sh
npm run build   # dist/index.html を作る
npm test        # 正しさのテスト（総当たりと照合）
npm run serve   # http://localhost:8000/ で確認
```

## データとライセンス
- 駅データ：[Seo-4d696b75/station_database](https://github.com/Seo-4d696b75/station_database)（CC BY 4.0）。`data/station.csv` はそのスナップショットです。
- 地図：© OpenStreetMap contributors、地理院タイル
