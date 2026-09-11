import wordmark from '../assets/logo/tackbar-wordmark.svg'
import invertedWordmark from '../assets/logo/tackbar-wordmark-inverted.svg'

export default function TackBarBrand({ inverted = false }: { inverted?: boolean }) {
  return <img className="brand" src={inverted ? invertedWordmark : wordmark} alt="TackBar" width={170} height={34} />
}
