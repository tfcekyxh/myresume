import { useFieldArray, useFormContext } from 'react-hook-form'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ResumeData } from '@mymenu/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TextAreaField, TextField } from './fields'
import { PointsField } from './points-field'
import { PhotoField } from './photo-field'
import { SortableItem, SortableList } from './sortable-list'

/** 简历各模块的表单分组。共用外层 form，通过 useFormContext 读写字段。 */

function ModuleCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      <Plus /> {children}
    </Button>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>
}

const BASIC_FIELDS = [
  { key: 'name', label: '姓名' },
  { key: 'intention', label: '求职意向' },
  { key: 'gender', label: '性别' },
  { key: 'age', label: '年龄' },
  { key: 'phone', label: '电话' },
  { key: 'email', label: '邮箱' },
] as const

export function BasicForm() {
  const { register } = useFormContext<ResumeData>()

  return (
    <ModuleCard title="基本信息">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {BASIC_FIELDS.map(({ key, label }) => (
          <TextField
            key={key}
            label={label}
            placeholder={label}
            {...register(`basic.${key}`)}
          />
        ))}
      </div>

      {/* 证件照单独走照片接口，不放进简历 JSON */}
      <PhotoField />
    </ModuleCard>
  )
}

export function EducationForm() {
  const { register, control } = useFormContext<ResumeData>()
  const { fields, append, remove, move } = useFieldArray({ control, name: 'education' })

  return (
    <ModuleCard title="教育经历">
      {fields.length === 0 && <EmptyHint>暂无教育经历，点下方按钮添加</EmptyHint>}

      <SortableList ids={fields.map((f) => f.id)} onReorder={move}>
        <div className="space-y-3">
          {fields.map((field, index) => (
            <SortableItem
              key={field.id}
              id={field.id}
              title={`教育经历 ${index + 1}`}
              onRemove={() => remove(index)}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField label="学校" placeholder="学校" {...register(`education.${index}.school`)} />
                <TextField label="学历" placeholder="学历" {...register(`education.${index}.degree`)} />
                <TextField label="专业" placeholder="专业" {...register(`education.${index}.major`)} />
                <TextField
                  label="起止时间"
                  placeholder="如 2018.09 - 2022.06"
                  {...register(`education.${index}.period`)}
                />
              </div>
            </SortableItem>
          ))}
        </div>
      </SortableList>

      <AddButton onClick={() => append({ school: '', degree: '', major: '', period: '' })}>
        添加教育经历
      </AddButton>
    </ModuleCard>
  )
}

export function SkillsForm() {
  const { register, control } = useFormContext<ResumeData>()
  const { fields, append, remove, move } = useFieldArray({ control, name: 'skills' })

  return (
    <ModuleCard title="专业技能">
      <EmptyHint>每条为一段说明，导出时按顺序编号</EmptyHint>

      {fields.length > 0 && (
        <SortableList ids={fields.map((f) => f.id)} onReorder={move}>
          <div className="space-y-3">
            {fields.map((field, index) => (
              <SortableItem
                key={field.id}
                id={field.id}
                title={`技能 ${index + 1}`}
                onRemove={() => remove(index)}
              >
                <TextAreaField
                  label="技能描述"
                  placeholder="如 熟悉 TypeScript / React，有大型前端项目经验"
                  {...register(`skills.${index}.text`)}
                />
              </SortableItem>
            ))}
          </div>
        </SortableList>
      )}

      <AddButton onClick={() => append({ text: '' })}>添加技能</AddButton>
    </ModuleCard>
  )
}

type ExperienceModule = 'work' | 'internship'

function ExperienceForm({ module, title }: { module: ExperienceModule; title: string }) {
  const { register, control } = useFormContext<ResumeData>()
  const { fields, append, remove, move } = useFieldArray({ control, name: module })

  return (
    <ModuleCard title={title}>
      {fields.length === 0 && <EmptyHint>暂无{title}，点下方按钮添加</EmptyHint>}

      <SortableList ids={fields.map((f) => f.id)} onReorder={move}>
        <div className="space-y-3">
          {fields.map((field, index) => (
            <SortableItem
              key={field.id}
              id={field.id}
              title={`${title} ${index + 1}`}
              onRemove={() => remove(index)}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField label="公司" placeholder="公司" {...register(`${module}.${index}.company`)} />
                  <TextField label="职位" placeholder="职位" {...register(`${module}.${index}.role`)} />
                  <TextField
                    label="起止时间"
                    className="sm:col-span-2"
                    placeholder="如 2022.07 - 至今"
                    {...register(`${module}.${index}.period`)}
                  />
                </div>
                <TextAreaField
                  label="概述（可选）"
                  placeholder="一句话概括这段经历"
                  {...register(`${module}.${index}.summary`)}
                />
                <PointsField name={`${module}.${index}.points`} />
              </div>
            </SortableItem>
          ))}
        </div>
      </SortableList>

      <AddButton
        onClick={() =>
          append({ company: '', role: '', period: '', summary: '', points: [] })
        }
      >
        添加{title}
      </AddButton>
    </ModuleCard>
  )
}

export function WorkForm() {
  return <ExperienceForm module="work" title="工作经历" />
}

export function InternshipForm() {
  return <ExperienceForm module="internship" title="实习经历" />
}

export function ProjectsForm() {
  const { register, control } = useFormContext<ResumeData>()
  const { fields, append, remove, move } = useFieldArray({ control, name: 'projects' })

  return (
    <ModuleCard title="项目经历">
      {fields.length === 0 && <EmptyHint>暂无项目经历，点下方按钮添加</EmptyHint>}

      <SortableList ids={fields.map((f) => f.id)} onReorder={move}>
        <div className="space-y-3">
          {fields.map((field, index) => (
            <SortableItem
              key={field.id}
              id={field.id}
              title={`项目 ${index + 1}`}
              onRemove={() => remove(index)}
            >
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <TextField label="项目名称" placeholder="项目名称" {...register(`projects.${index}.name`)} />
                  <TextField
                    label="项目类型"
                    placeholder="如 全栈项目"
                    {...register(`projects.${index}.type`)}
                  />
                  <TextField
                    label="起止时间"
                    placeholder="如 2023.03 - 2023.09"
                    {...register(`projects.${index}.period`)}
                  />
                </div>
                <TextAreaField
                  label="项目描述"
                  placeholder="项目背景与目标"
                  {...register(`projects.${index}.description`)}
                />
                <TextField
                  label="技术栈"
                  placeholder="如 React / TypeScript / PostgreSQL"
                  {...register(`projects.${index}.techStack`)}
                />
                <PointsField name={`projects.${index}.points`} label="项目要点" />
              </div>
            </SortableItem>
          ))}
        </div>
      </SortableList>

      <AddButton
        onClick={() =>
          append({ name: '', type: '', period: '', description: '', techStack: '', points: [] })
        }
      >
        添加项目经历
      </AddButton>
    </ModuleCard>
  )
}

export function FooterForm() {
  const { register } = useFormContext<ResumeData>()

  return (
    <ModuleCard title="页脚">
      <TextAreaField
        label="页脚文字"
        placeholder="留空则不输出"
        {...register('footer')}
      />
    </ModuleCard>
  )
}
