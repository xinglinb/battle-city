import { saveAs } from 'file-saver'
import React from 'react'
import { connect } from 'react-redux'
import { match, Redirect, Route, Switch } from 'react-router-dom'
import { goBack, push, replace } from 'react-router-redux'
import { Dispatch } from 'redux'
import { RawStageConfig, State } from '../types'
import Popup from '../types/Popup'
import { StageConfigConverter } from '../types/StageConfig'
import { BLOCK_SIZE as B } from '../utils/constants'
import PopupProvider, { PopupHandle } from './PopupProvider'
import Screen from './Screen'
import StagePreview from './StagePreview'
import Text from './Text'
import TextButton from './TextButton'

type StageListProps = {
  dispatch: Dispatch<State>
  tab: 'default' | 'custom'
  page: number
  popupHandle: PopupHandle
} & State

const STAGE_COUNT_PER_PAGE = 6
const GAP = 25
const LEN = 52 + GAP

class StageListPageUnconnected extends React.PureComponent<StageListProps> {
  private input: HTMLInputElement
  private resetButton: HTMLInputElement
  private form: HTMLFormElement

  state = {
    popup: null as Popup,
  }

  componentDidMount() {
    this.form = document.createElement('form')
    this.resetButton = document.createElement('input')
    this.input = document.createElement('input')

    this.resetButton.type = 'reset'
    this.input.type = 'file'

    this.form.style.display = 'none'

    this.input.addEventListener('change', this.onUploadFile)

    this.form.appendChild(this.input)
    this.form.appendChild(this.resetButton)
    document.body.appendChild(this.form)
  }

  componentWillUnmount() {
    this.input.removeEventListener('change', this.onUploadFile)
    this.form.remove()
  }

  onUploadFile = () => {
    const { popupHandle: { showAlertPopup, showConfirmPopup } } = this.props
    const file = this.input.files[0]
    if (file == null) {
      return
    }
    const fileReader = new FileReader()
    fileReader.readAsText(file)
    fileReader.onloadend = async () => {
      try {
        const raw: RawStageConfig = JSON.parse(fileReader.result)
        const stage = StageConfigConverter.r2s(raw).set('custom', true)
        const { dispatch, stages, tab } = this.props
        if (stages.some(s => !s.custom && s.name === stage.name)) {
          await showAlertPopup(`Stage ${stage.name} already exists.`)
          return
        }
        if (stages.some(s => s.custom && s.name === stage.name)) {
          const confirmed = await showConfirmPopup('Override exsiting custome stage. continue?')
          if (!confirmed) {
            return
          }
        }
        dispatch<Action>({ type: 'SET_CUSTOM_STAGE', stage })
        dispatch<Action>({ type: 'SYNC_CUSTOM_STAGES' })
        if (tab !== 'custom') {
          dispatch(replace('/list/custom'))
        }
      } catch (error) {
        console.error(error)
        await showAlertPopup('Failed to parse stage config file.')
      } finally {
        this.resetButton.click()
      }
    }
  }

  getMaxPage() {
    const { tab, stages } = this.props
    if (tab === 'default') {
      const defaultStageCount = stages.filter(s => !s.custom).count()
      return Math.ceil(defaultStageCount / STAGE_COUNT_PER_PAGE)
    } else {
      const customStageCount = stages.filter(s => s.custom).count()
      return Math.ceil(customStageCount / STAGE_COUNT_PER_PAGE)
    }
  }

  onChoosePrevPage = () => {
    const { dispatch, tab, page } = this.props
    const prev = Math.max(1, page - 1)
    dispatch(replace(`/list/${tab}/${prev}`))
  }

  onChooseNextPage = () => {
    const { dispatch, tab, page } = this.props
    const next = Math.min(this.getMaxPage(), page + 1)
    dispatch(replace(`/list/${tab}/${next}`))
  }

  onPlay(stageName: string) {
    this.props.dispatch(push(`/stage/${stageName}`))
  }

  onEdit(stageName: string) {
    const { dispatch, stages } = this.props
    const stage = stages.find(s => s.name === stageName)
    dispatch<Action.SetEditorContent>({ type: 'SET_EDITOR_CONTENT', stage })
    dispatch(push('/editor'))
  }

  async onDelete(stageName: string) {
    const { popupHandle: { showConfirmPopup } } = this.props
    if (await showConfirmPopup(`Delete stage ${stageName}?`)) {
      this.props.dispatch<Action>({
        type: 'REMOVE_CUSTOM_STAGE',
        stageName,
      })
      this.props.dispatch<Action>({ type: 'SYNC_CUSTOM_STAGES' })
    }
  }

  async onDownload(stageName: string) {
    const { stages } = this.props
    const stage = stages.find(s => s.name === stageName)
    const json = StageConfigConverter.s2r(stage)
    delete json.custom
    const content = JSON.stringify(json, null, 2)
    saveAs(new Blob([content], { type: 'text/plain;charset=utf-8' }), `stage-${stage.name}.json`)
  }

  render() {
    const { tab, page, dispatch, stages: allStages, popupHandle: { popup } } = this.props
    const filteredStages = allStages.filter(
      s => (s.custom && tab === 'custom') || (!s.custom && tab === 'default'),
    )
    const startIndex = (page - 1) * STAGE_COUNT_PER_PAGE
    const stages = filteredStages.slice(startIndex, startIndex + STAGE_COUNT_PER_PAGE)
    return (
      <Screen background="#333">
        <Text content="stages" x={0.5 * B} y={0.5 * B} />
        <TextButton
          content="default"
          x={4.5 * B}
          y={0.5 * B}
          selected={tab === 'default'}
          onClick={tab !== 'default' ? () => dispatch(replace('/list/default')) : null}
        />
        <TextButton
          content="custom"
          x={8.5 * B}
          y={0.5 * B}
          selected={tab === 'custom'}
          onClick={tab !== 'custom' ? () => dispatch(replace('/list/custom')) : null}
        />
        {stages.isEmpty() ? (
          <Text x={0.5 * B} y={3 * B} content="No custom stage." fill="#666666" />
        ) : null}
        <g transform="translate(0, 40)">
          {stages
            .map((stage, index) => {
              const x = GAP + (index % 3) * LEN
              const y = 70 * Math.floor(index / 3)
              return (
                <g key={stage.name} transform={`translate(${x}, ${y}) `}>
                  <StagePreview disableImageCache={tab === 'custom'} stage={stage} scale={0.25} />
                  <g transform="scale(0.5)">
                    <Text content={stage.name} fill="#dd2664" />
                  </g>
                  <g transform="translate(0, 56) scale(0.5)">
                    <TextButton
                      x={0 * B}
                      y={0}
                      content="play"
                      onClick={() => this.onPlay(stage.name)}
                    />
                    <TextButton
                      x={2.5 * B}
                      y={0}
                      content="edit"
                      onClick={() => this.onEdit(stage.name)}
                    />
                    {stage.custom ? (
                      <TextButton
                        x={5 * B}
                        y={0}
                        content="x"
                        onClick={() => this.onDelete(stage.name)}
                      />
                    ) : null}
                    <TextButton
                      x={6 * B}
                      y={0}
                      content={'\u2193'}
                      onClick={() => this.onDownload(stage.name)}
                    />
                  </g>
                </g>
              )
            })
            .toArray()}
        </g>
        <g transform={`translate(${6.5 * B}, 0)`}>
          <TextButton
            x={0}
            y={12 * B}
            content={'\u2190'}
            onClick={this.onChoosePrevPage}
            disabled={page === 1}
          />
          <Text x={1.25 * B} y={12 * B} content={String(page)} />
          <TextButton
            x={2.5 * B}
            y={12 * B}
            content={'\u2192'}
            onClick={this.onChooseNextPage}
            disabled={page >= this.getMaxPage()}
          />
        </g>
        <g className="button-areas" transform={`translate(${5.5 * B}, ${13.5 * B})`}>
          <TextButton content="editor" x={0 * B} y={0} onClick={() => dispatch(push('/editor'))} />
          <TextButton content="upload" x={3.5 * B} y={0} onClick={() => this.input.click()} />
          <TextButton content="back" x={7 * B} y={0} onClick={() => dispatch(goBack())} />
        </g>
        <g className="hint" transform={`translate(${0.5 * B},${14.5 * B}) scale(0.5)`}>
          <Text fill="#999" content="This page is a little janky. Keep patient." />
        </g>
        {popup}
      </Screen>
    )
  }
}

const StageListPage = connect((s: State) => s)(StageListPageUnconnected)

interface PageMatch {
  match: match<{ page: string }>
}

export default class StageListPageWrapper extends React.PureComponent<{ match: match<any> }> {
  render() {
    const { match } = this.props
    return (
      <PopupProvider>
        {popupHandle => (
          <Switch>
            <Route exact path="/list" render={() => <Redirect to="/list/default" />} />
            <Route exact path="/list/default" render={() => <Redirect to="/list/default/1" />} />
            <Route exact path="/list/custom" render={() => <Redirect to="/list/custom/1" />} />
            <Route
              path={`${match.url}/default/:page`}
              render={({ match: { params: { page } } }: PageMatch) => (
                <StageListPage popupHandle={popupHandle} tab="default" page={Number(page)} />
              )}
            />
            <Route
              path={`${match.url}/custom/:page`}
              render={({ match: { params: { page } } }: PageMatch) => (
                <StageListPage popupHandle={popupHandle} tab="custom" page={Number(page)} />
              )}
            />
          </Switch>
        )}
      </PopupProvider>
    )
  }
}
