import { NextFunction, Request, Response } from "express"
import { getRepository } from "typeorm"
import { GroupStudent } from "../entity/group-student.entity"
import { Group } from "../entity/group.entity"
import { StudentRollState } from "../entity/student-roll-state.entity"
import { CreateGroupInput, UpdateGroupInput, CreateGroupStudentInput } from "../interface/group.interface"

export class GroupController {
  private groupRepository = getRepository(Group)
  private groupStudentRepository = getRepository(GroupStudent)
  private studentRollStateRepository = getRepository(StudentRollState)

  async allGroups(request: Request, response: Response, next: NextFunction) {
    return this.groupRepository.find()
  }

  async createGroup(request: Request, response: Response, next: NextFunction) {
    const { body: params } = request

    const createGroupInput: CreateGroupInput = {
      name: params.name,
      number_of_weeks: params.number_of_weeks,
      roll_states: params.roll_states,
      incidents: params.incidents,
      ltmt: params.ltmt,
      student_count: 0,
    }
    const group = new Group()
    group.prepareToCreate(createGroupInput)

    return this.groupRepository.save(group)
  }

  async updateGroup(request: Request, response: Response, next: NextFunction) {
    const { body: params } = request

    this.groupRepository.findOne(params.id).then((group) => {
      const updateGroupInput: UpdateGroupInput = {
        id: params.id,
        name: params.name,
        number_of_weeks: params.number_of_weeks,
        roll_states: params.roll_states,
        incidents: params.incidents,
        ltmt: params.ltmt,
      }
      group.prepareToUpdate(updateGroupInput)
      return this.groupRepository.save(group)
    })
  }

  async removeGroup(request: Request, response: Response, next: NextFunction) {
    let groupToRemove = await this.groupRepository.findOne(request.params.id)
    return await this.groupRepository.remove(groupToRemove)
  }

  async getGroupStudents(request: Request, response: Response, next: NextFunction) {
    return this.groupStudentRepository.query(
      `SELECT first_name, last_name, first_name || ' ' || last_name as full_name FROM group_student LEFT JOIN student ON student.id = group_student.student_id`
    )
  }

  async runGroupFilters(request: Request, response: Response, next: NextFunction) {
    // Cleared group_student table
    const clearGroups = this.groupStudentRepository.clear()

    // Getting list of filtered Students using roll filter
    const groupList = await this.groupRepository.find()
    groupList.map(async (group) => {
      group.roll_states.split(",").map(async (roll_state) => {
        const filtered_students = await this.filterStudents(group, roll_state)
        filtered_students.map((filtered_student) => {
          if (group.ltmt === ">") {
            if (filtered_student.student_count > group.incidents) {
              // Inserting Group Students and upadting Group table
              this.insertFilteredGroupStudent(filtered_student, group)
            }
          }
          if (group.ltmt === "<") {
            if (filtered_student.student_count < group.incidents) {
              // Inserting Group Students and upadting Group table
              this.insertFilteredGroupStudent(filtered_student, group)
            }
          }
        })
      })
    })

    return { filtered: true }
  }

  async filterStudents(group: any, roll_state: string) {
    const total_days = group.number_of_weeks * 7
    const result = await this.studentRollStateRepository.query(
      `SELECT *, count(*) as student_count FROM student_roll_state LEFT JOIN roll ON roll.id = student_roll_state.roll_id WHERE (state='${roll_state}') AND (completed_at BETWEEN datetime('now', '-${total_days} days') AND datetime('now', 'localtime')) group by student_id`
    )
    return result
  }

  async insertFilteredGroupStudent(filtered_student, group) {
    const run_at = new Date()
    const createGroupStudentInput: CreateGroupStudentInput = {
      student_id: filtered_student.student_id,
      group_id: group.id,
      incident_count: filtered_student.student_count,
    }
    const groupStudent = new GroupStudent()
    groupStudent.prepateToCreateGroupStudent(createGroupStudentInput)
    this.groupStudentRepository.save(groupStudent)

    this.groupRepository
      .createQueryBuilder()
      .update("group")
      .set({ run_at: run_at })
      .set({ student_count: filtered_student.student_count })
      .where("id = :id", { id: group.id })
      .execute()
  }
}
